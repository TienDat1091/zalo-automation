/**
 * routineExecutor.js - Handles fetching integration data and sending automated routine messages
 */
const fetch = require('node-fetch');
const triggerDB = require('./triggerDB');

// --- DATA HELPERS ---

async function fetchCurrentLocation() {
    try {
        // Use ip-api.com to get location based on server IP
        const res = await fetch('http://ip-api.com/json/');
        if (!res.ok) throw new Error('Failed to fetch location');
        const data = await res.json();
        return {
            city: data.city || 'Ho Chi Minh City',
            lat: data.lat || 10.762622,
            lon: data.lon || 106.660172,
            country: data.country || 'Vietnam'
        };
    } catch (e) {
        console.warn('⚠️ Location fetch error (using default):', e.message);
        return { city: 'Ho Chi Minh City', lat: 10.762622, lon: 106.660172, country: 'Vietnam' };
    }
}

async function fetchWeatherData(lat, lon) {
    try {
        const res = await fetch(`https://wttr.in/${lat},${lon}?format=j1`);
        if (!res.ok) return null;
        const data = await res.json();
        const current = data.current_condition[0];
        return {
            temp: current.temp_C,
            desc: current.lang_vi?.[0]?.value || current.weatherDesc[0].value,
            humidity: current.humidity,
            feelsLike: current.FeelsLikeC
        };
    } catch (e) {
        console.error('❌ Weather fetch error:', e.message);
        return null;
    }
}

async function fetchAirQuality(lat, lon) {
    try {
        // WAQI API (Using a public search if possible or dynamic mock based on city)
        // For production, suggest user gets a token at https://aqicn.org/data-platform/token/
        const token = 'demo'; // 'demo' token works for some stations or general queries
        const res = await fetch(`https://api.waqi.info/feed/geo:${lat};${lon}/?token=${token}`);
        const data = await res.json();

        if (data.status === 'ok') {
            const aqi = data.data.aqi;
            let level = 'Tốt';
            if (aqi > 50) level = 'Trung bình';
            if (aqi > 100) level = 'Kém (Nhạy cảm)';
            if (aqi > 150) level = 'Xấu';
            if (aqi > 200) level = 'Rất xấu';
            if (aqi > 300) level = 'Nguy hại';

            return { aqi, level };
        }
        return null;
    } catch (e) { return null; }
}

async function fetchUserNews(userUID) {
    try {
        // Fetch from 'SYSTEM_NEWS' variable in variables table
        // We use a conversationID like 'system' for global news per user
        const db = triggerDB.getDB();
        const row = db.prepare("SELECT variableValue FROM variables WHERE userUID = ? AND variableName = ?").get(userUID, 'DAILY_NEWS');
        if (row && row.variableValue) {
            return row.variableValue;
        }
        return null;
    } catch (e) { return null; }
}

// --- MAIN EXECUTOR ---

async function executeRoutine(apiState, routine) {
    console.log(`🤖 Executing Routine: ${routine.routineName} for ${routine.targetName} (${routine.targetId})`);

    const integrations = routine.integrations || {};
    let message = `☀️ *${routine.routineName}*\n\n`;
    let hasData = false;

    // Get Location first
    const loc = await fetchCurrentLocation();

    // 1. Weather
    if (integrations.weather) {
        const weather = await fetchWeatherData(loc.lat, loc.lon);
        if (weather) {
            message += `📍 Vị trí: ${loc.city}\n🌤️ Thời tiết: ${weather.desc}, ${weather.temp}°C (Cảm giác như ${weather.feelsLike}°C). Độ ẩm ${weather.humidity}%\n`;
            hasData = true;
        }
    }

    // 2. Air Quality
    if (integrations.air) {
        const air = await fetchAirQuality(loc.lat, loc.lon);
        if (air) {
            message += `🌬️ Không khí (AQI): ${air.aqi} - ${air.level}\n`;
            hasData = true;
        }
    }

    // 3. News (Self-updated by user)
    if (integrations.news) {
        const newsContent = await fetchUserNews(routine.userUID);
        if (newsContent) {
            message += `\n📰 Tin tức hôm nay:\n${newsContent}\n`;
            hasData = true;
        } else {
            message += `\n📰 Tin tức: (Chưa có tin mới từ hệ thống)\n`;
        }
    }

    // 4. Custom Message
    if (integrations.customMessage) {
        message += `\n📝 Ghi chú: ${integrations.customMessage}\n`;
        hasData = true;
    }

    // 5. Google Sheets Data
    if (integrations.googleSheet && integrations.gsheetId) {
        const config = triggerDB.getGoogleSheetConfigById?.(integrations.gsheetId);
        if (config) {
            message += `\n📊 Cập nhật từ Sheet [${config.name}]: [Dữ liệu sẵn sàng]`;
            hasData = true;
        }
    }

    // 6. Flow Integration
    if (integrations.flowId) {
        const flow = triggerDB.getFlowById(integrations.flowId);
        if (flow) {
            console.log(`⚡ Routine triggering Flow: ${flow.flowName}`);
            const flowExecutor = require('./flowExecutor');
            const fakeReq = { type: 'automation_routine', routineId: routine.id };
            flowExecutor.executeFlow(apiState, flow, routine.targetId, fakeReq, routine.userUID).catch(e => console.error('Flow execution error:', e));
            hasData = true;
        }
    }

    try {
        if (hasData) {
            if (apiState.api && apiState.api.sendMessage) {
                const { ThreadType } = require('zca-js');
                await apiState.api.sendMessage(message.trim(), routine.targetId, ThreadType.User);
                console.log(`✅ Message sent for Routine #${routine.id}`);

                // ✅ CHECK AUTO MARK UNREAD
                try {
                    const allTriggers = triggerDB.getTriggersByUser(routine.userUID);
                    const t = allTriggers.find(r => r.triggerKey === '__builtin_auto_unread__');
                    if (t && t.enabled) {
                        console.log(`🔖 Marking routine thread ${routine.targetId} as unread...`);
                        await apiState.api.addUnreadMark(routine.targetId, ThreadType.User);
                    }
                } catch (e) { console.error('Marker error:', e.message); }

            } else {
                console.warn('⚠️ Zalo API not ready, could not send routine message');
            }
        }

        triggerDB.updateAutomationRoutine(routine.id, routine.userUID, { lastRun: Date.now() });
        console.log(`✅ Routine #${routine.id} processing cycle completed`);
    } catch (err) {
        console.error(`❌ Routine #${routine.id} failed:`, err.message);
    }
}

module.exports = { executeRoutine };
