# watchdog.py - Health Check & Auto-Restart Mechanism
# Monitors response time and automatically restarts if app gets stuck
import time
import threading
import requests
import subprocess
import sys
import os
from datetime import datetime


class HealthChecker:
    """Monitor app health and auto-restart if response time is too long"""

    def __init__(self, check_url="http://localhost:3000/api/session-status", 
                 response_timeout=10, max_slow_checks=3, check_interval=5):
        """
        Args:
            check_url: URL to check for health
            response_timeout: Max seconds to wait for response (seconds)
            max_slow_checks: Restart after N consecutive slow responses
            check_interval: Check every N seconds
        """
        self.check_url = check_url
        self.response_timeout = response_timeout
        self.max_slow_checks = max_slow_checks
        self.check_interval = check_interval
        
        self.running = False
        self.consecutive_slow = 0
        self.last_check_time = None
        self.last_response_time = None
        self._thread = None
        self.on_restart = None  # Callback when restart happens
        self.on_status_change = None  # Callback for status changes

    def start(self):
        """Start health checking in background"""
        if self.running:
            return
        
        self.running = True
        self._thread = threading.Thread(target=self._check_loop, daemon=True)
        self._thread.start()
        print("🏥 Health checker started")

    def stop(self):
        """Stop health checking"""
        self.running = False
        if self._thread:
            self._thread.join(timeout=2)
        print("🏥 Health checker stopped")

    def _check_loop(self):
        """Main health check loop"""
        while self.running:
            try:
                self._perform_check()
            except Exception as e:
                print(f"❌ Health check error: {e}")
            
            time.sleep(self.check_interval)

    def _perform_check(self):
        """Perform a single health check"""
        self.last_check_time = datetime.now()
        
        try:
            start = time.time()
            response = requests.get(self.check_url, timeout=self.response_timeout)
            elapsed = time.time() - start
            self.last_response_time = elapsed
            
            if response.status_code == 200:
                # Response OK
                if elapsed < self.response_timeout * 0.7:  # Good response time
                    self.consecutive_slow = 0
                    self._notify_status("✅ 健康 (%.2fs)" % elapsed)
                else:  # Slow but acceptable
                    self.consecutive_slow = 0
                    self._notify_status("⚠️ 缓慢 (%.2fs)" % elapsed)
            else:
                # Bad status code
                self.consecutive_slow += 1
                self._notify_status(f"❌ 错误 {response.status_code}")
                self._check_restart()
                
        except requests.Timeout:
            # Request timed out - app is hung
            self.consecutive_slow += 1
            self.last_response_time = self.response_timeout
            self._notify_status(f"⏱️ 超时 ({self.response_timeout}s)")
            self._check_restart()
            
        except requests.ConnectionError:
            # Can't connect - server might be down
            self.consecutive_slow += 1
            self._notify_status("🔌 无法连接")
            self._check_restart()
            
        except Exception as e:
            self.consecutive_slow += 1
            self._notify_status(f"⚠️ {str(e)[:20]}")

    def _check_restart(self):
        """Check if we should restart"""
        if self.consecutive_slow >= self.max_slow_checks:
            print(f"\n🔴 应用无响应! 连续 {self.consecutive_slow} 次慢/失败检查")
            self._restart_app()

    def _restart_app(self):
        """Restart the Node.js server"""
        if self.on_restart:
            self.on_restart()
        
        print("\n" + "="*50)
        print("🔄 开始重启应用...")
        print("="*50 + "\n")
        
        self.consecutive_slow = 0

        try:
            # Kill existing Node.js process
            if sys.platform == 'win32':
                os.system('taskkill /F /IM node.exe >nul 2>&1')
            else:
                os.system('pkill -9 node')
            
            time.sleep(2)
            
            # Restart (callback will handle this in main app)
            
        except Exception as e:
            print(f"❌ Restart error: {e}")

    def _notify_status(self, status):
        """Notify of status change"""
        if self.on_status_change:
            self.on_status_change(status)


class AppWatchdog:
    """Higher-level watchdog for Python/Node.js app"""

    def __init__(self, node_process=None, config=None):
        """
        Args:
            node_process: Node.js subprocess object
            config: Configuration dict with limits
        """
        self.node_process = node_process
        self.config = config or {
            'check_url': 'http://localhost:3000/api/session-status',
            'response_timeout': 10,
            'max_slow_checks': 3,
            'check_interval': 5,
            'memory_limit_mb': 500
        }
        
        self.health_checker = HealthChecker(
            check_url=self.config['check_url'],
            response_timeout=self.config['response_timeout'],
            max_slow_checks=self.config['max_slow_checks'],
            check_interval=self.config['check_interval']
        )
        
        self.on_restart = None

    def start(self):
        """Start watchdog monitoring"""
        self.health_checker.on_restart = self._on_restart_needed
        self.health_checker.on_status_change = self._on_status_change
        self.health_checker.start()

    def stop(self):
        """Stop watchdog"""
        self.health_checker.stop()

    def _on_restart_needed(self):
        """Handle restart request"""
        if self.on_restart:
            self.on_restart()
        self._kill_node_process()

    def _kill_node_process(self):
        """Kill Node.js process if it exists"""
        try:
            if self.node_process and self.node_process.poll() is None:
                print("Terminating Node.js process...")
                self.node_process.terminate()
                try:
                    self.node_process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    self.node_process.kill()
                print("Node.js process terminated")
        except Exception as e:
            print(f"Error killing process: {e}")

    def _on_status_change(self, status):
        """Handle status change notification"""
        print(f"  📊 Status: {status}")

    def set_restart_callback(self, callback):
        """Set callback for when restart happens"""
        self.on_restart = callback
