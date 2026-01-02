// public/js/blocks/block-types.js
// Định nghĩa các block types cho UI

const BLOCK_CATEGORIES = {
  message: { name: 'Tin nhắn', icon: '💬', color: '#e3f2fd' },
  logic: { name: 'Logic', icon: '⚙️', color: '#fff3e0' },
  action: { name: 'Hành động', icon: '⚡', color: '#f3e5f5' },
  integration: { name: 'Tích hợp', icon: '🔌', color: '#e8f5e9' }
};

const BLOCK_TYPES = {
  // ========== MESSAGE BLOCKS ==========
  'send-message': {
    type: 'send-message',
    name: 'Gửi tin nhắn',
    desc: 'Gửi text message',
    icon: '💬',
    category: 'message',
    color: '#e3f2fd',
    defaultData: { message: '' }
  },
  
  'send-image': {
    type: 'send-image',
    name: 'Gửi hình ảnh',
    desc: 'Gửi ảnh từ URL',
    icon: '🖼️',
    category: 'message',
    color: '#e3f2fd',
    defaultData: { imageUrl: '', caption: '' }
  },
  
  'send-file': {
    type: 'send-file',
    name: 'Gửi file',
    desc: 'Gửi file đính kèm',
    icon: '📎',
    category: 'message',
    color: '#e3f2fd',
    defaultData: { fileUrl: '', fileName: '' }
  },
  
  'send-friend-request': {
    type: 'send-friend-request',
    name: 'Gửi kết bạn',
    desc: 'Gửi lời mời kết bạn',
    icon: '👋',
    category: 'message',
    color: '#bbdefb',
    defaultData: {
      targetType: 'sender',
      targetUserId: '',
      targetVariable: '',
      message: 'Xin chào, hãy kết bạn với tôi!'
    }
  },
  
  'accept-friend-request': {
    type: 'accept-friend-request',
    name: 'Chấp nhận kết bạn',
    desc: 'Tự động chấp nhận',
    icon: '🤝',
    category: 'message',
    color: '#bbdefb',
    defaultData: {
      autoAccept: true,
      sendWelcome: true,
      welcomeMessage: 'Cảm ơn bạn đã kết bạn!',
      runFlowAfter: null
    }
  },
  
  // ========== LOGIC BLOCKS ==========
  'delay': {
    type: 'delay',
    name: 'Delay',
    desc: 'Chờ thời gian',
    icon: '⏱️',
    category: 'logic',
    color: '#fff3e0',
    defaultData: { duration: 2000, unit: 'ms' }
  },
  
  'run-block': {
    type: 'run-block',
    name: 'Run Block',
    desc: 'Chạy flow khác',
    icon: '🔗',
    category: 'logic',
    color: '#fff3e0',
    defaultData: { targetTriggerId: null }
  },
  
  'condition': {
    type: 'condition',
    name: 'Điều kiện',
    desc: 'IF/ELSE',
    icon: '🔀',
    category: 'logic',
    color: '#ffe0b2',
    defaultData: {
      variableName: '',
      operator: 'equals',
      compareValue: '',
      trueFlowId: null,
      falseFlowId: null
    }
  },
  
  'user-input': {
    type: 'user-input',
    name: 'Lắng nghe',
    desc: 'Chờ user nhập',
    icon: '👂',
    category: 'logic',
    color: '#b3e5fc',
    defaultData: {
      questions: [{
        message: '',
        expectedType: 'text',
        maxRetries: 2,
        variableName: '',
        retryMessage: ''
      }],
      timeoutValue: 1,
      timeoutUnit: 'hour'
    }
  },
  
  'bot-active': {
    type: 'bot-active',
    name: 'Điều khiển Bot',
    desc: 'Bật/tắt bot',
    icon: '🤖',
    category: 'logic',
    color: '#fff3e0',
    defaultData: { action: 'toggle', duration: 0, scope: 'current' }
  },
  
  // ========== ACTION BLOCKS ==========
  'set-variable': {
    type: 'set-variable',
    name: 'Đặt biến',
    desc: 'Lưu giá trị',
    icon: '📝',
    category: 'action',
    color: '#f3e5f5',
    defaultData: { variableName: '', variableValue: '', variableType: 'text' }
  },
  
  'clear-variable': {
    type: 'clear-variable',
    name: 'Xóa biến',
    desc: 'Xóa biến',
    icon: '🗑️',
    category: 'action',
    color: '#f3e5f5',
    defaultData: { variableName: '', clearAll: false }
  },
  
  'payment-hub': {
    type: 'payment-hub',
    name: 'Cổng thanh toán',
    desc: 'Tạo thanh toán',
    icon: '💳',
    category: 'action',
    color: '#fff9c4',
    defaultData: {
      gateId: null,
      amount: '',
      amountType: 'manual',
      amountVariable: '',
      note: '',
      saveTransactionTo: ''
    }
  },
  
  // ========== INTEGRATION BLOCKS ==========
  'webhook': {
    type: 'webhook',
    name: 'Webhook',
    desc: 'Gọi API',
    icon: '🌐',
    category: 'integration',
    color: '#e8f5e9',
    defaultData: { url: '', method: 'GET', headers: '', body: '' }
  },
  
  'ai-gemini': {
    type: 'ai-gemini',
    name: 'AI Gemini',
    desc: 'Tích hợp AI',
    icon: '🧠',
    category: 'integration',
    color: '#e8f5e9',
    defaultData: { prompt: '', apiKey: '', saveResponseTo: '' }
  }
};

// Input validation types
const INPUT_TYPES = [
  { value: 'none', label: 'Bất kỳ' },
  { value: 'text', label: 'Văn bản' },
  { value: 'number', label: 'Số' },
  { value: 'phone', label: 'SĐT' },
  { value: 'email', label: 'Email' },
  { value: 'picture', label: 'Hình ảnh' },
  { value: 'file', label: 'File' },
  { value: 'yesno', label: 'Có/Không' }
];

// Condition operators
const OPERATORS = [
  { value: 'equals', label: 'Bằng (=)' },
  { value: 'not_equals', label: 'Khác (≠)' },
  { value: 'contains', label: 'Chứa' },
  { value: 'not_contains', label: 'Không chứa' },
  { value: 'starts_with', label: 'Bắt đầu bằng' },
  { value: 'ends_with', label: 'Kết thúc bằng' },
  { value: 'greater_than', label: 'Lớn hơn (>)' },
  { value: 'less_than', label: 'Nhỏ hơn (<)' },
  { value: 'greater_equal', label: 'Lớn hơn hoặc bằng (≥)' },
  { value: 'less_equal', label: 'Nhỏ hơn hoặc bằng (≤)' },
  { value: 'is_empty', label: 'Rỗng' },
  { value: 'is_not_empty', label: 'Không rỗng' }
];

// Time units for delay
const TIME_UNITS = [
  { value: 'ms', label: 'Mili-giây' },
  { value: 's', label: 'Giây' },
  { value: 'm', label: 'Phút' },
  { value: 'h', label: 'Giờ' }
];

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BLOCK_TYPES, BLOCK_CATEGORIES, INPUT_TYPES, OPERATORS, TIME_UNITS };
}

if (typeof window !== 'undefined') {
  window.BLOCK_TYPES = BLOCK_TYPES;
  window.BLOCK_CATEGORIES = BLOCK_CATEGORIES;
  window.INPUT_TYPES = INPUT_TYPES;
  window.OPERATORS = OPERATORS;
  window.TIME_UNITS = TIME_UNITS;
}
