/**
 * ChatStore — 玉瑶聊天状态管理
 */
import { create } from 'zustand';

/** P2-2: 当前聊天对象状态（后端 /api/chat 响应附带，UI 显示单一事实来源） */
export interface ChatStateInfo {
  /** yuyao=玉瑶默认态 / private=私聊-XX / meeting=会晤(2人+) */
  mode: 'yuyao' | 'private' | 'meeting';
  /** 当前聊天对象昵称（玉瑶/熊梓铭/...） */
  targetName: string;
  /** 会晤参会人昵称列表（非会晤为空） */
  participants: string[];
  /** 本条回复发言者 —— 仅会晤返回当前主发言实体，私聊/玉瑶为 null */
  speakerName: string | null;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  /** P2-2: 会晤发言者昵称（仅会晤消息有值，前端据此前置【昵称】） */
  speaker?: string;
  /** 候选回复（语气/深度变体，供用户选择偏好） */
  candidates?: { a: { text: string; label: string }; b: { text: string; label: string } } | null;
  /** 30秒内撤回标记 */
  recalled?: boolean;
}

interface ChatStore {
  messages: ChatMessage[];
  isOpen: boolean;
  isTyping: boolean;
  error: string | null;
  turnCount: number;
  /** 情绪传染触发时闪烁 */
  emotionalFlash: boolean;
  triggeredMemoryId: string | null;
  m3Data: any | null;
  /** SSE 流式输出缓冲 */
  streamBuffer: string;
  streamMessageId: string | null;
  /** P2-2: 当前聊天对象状态（顶部状态栏/发言前缀渲染） */
  chatState: ChatStateInfo | null;

  toggleOpen: () => void;
  setOpen: (open: boolean) => void;
  addMessage: (role: 'user' | 'assistant', content: string, speaker?: string) => void;
  setChatState: (state: ChatStateInfo | null) => void;
  setTyping: (typing: boolean) => void;
  setError: (error: string | null) => void;
  setTurnCount: (count: number) => void;
  setM3Data: (data: any) => void;
  setLastMessageCandidates: (candidates: any) => void;
  clearMessages: () => void;
  recallMessage: (id: string) => void;
  triggerFlash: (memoryId?: string) => void;
  /** SSE 流式操作 */
  appendStreamMessage: (chunk: string) => void;
  finalizeStreamMessage: () => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  isOpen: false,
  isTyping: false,
  error: null,
  turnCount: 0,
  emotionalFlash: false,
  triggeredMemoryId: null,
  m3Data: null,
  streamBuffer: '',
  streamMessageId: null,
  chatState: null,

  toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),
  setOpen: (open) => set({ isOpen: open }),
  setChatState: (state) => set({ chatState: state }),

  addMessage: (role, content, speaker) =>
    set((s) => ({
      messages: [
        ...s.messages,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          role,
          content,
          timestamp: Date.now(),
          speaker,
        },
      ],
    })),

  setTyping: (typing) => set({ isTyping: typing }),
  setError: (error) => set({ error }),
  setTurnCount: (count) => set({ turnCount: count }),
  clearMessages: () => set({ messages: [], turnCount: 0, emotionalFlash: false, triggeredMemoryId: null }),
  recallMessage: (id: string) =>
    set((s) => ({
      messages: s.messages.map(m => m.id === id ? { ...m, recalled: true } : m),
    })),
  setLastMessageCandidates: (candidates) =>
    set((s) => {
      const msgs = [...s.messages];
      if (msgs.length > 0) msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], candidates };
      return { messages: msgs };
    }),
  setM3Data: (data) => set({ m3Data: data }),
  triggerFlash: (memoryId) => {
    set({ emotionalFlash: true, triggeredMemoryId: memoryId ?? null });
    setTimeout(() => set({ emotionalFlash: false, triggeredMemoryId: null }), 1500);
  },

  /** SSE 流式：追加一个文本块到当前流消息 */
  appendStreamMessage: (chunk: string) => {
    const state = get();
    if (!state.streamMessageId) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      set((s) => ({
        streamMessageId: id,
        messages: [
          ...s.messages,
          { id, role: 'assistant', content: chunk, timestamp: Date.now() },
        ],
      }));
    } else {
      const updated = state.messages.map(m =>
        m.id === state.streamMessageId
          ? { ...m, content: m.content + chunk }
          : m
      );
      set({ messages: updated });
    }
  },

  /** SSE 流式：结束当前流消息，重置缓冲 */
  finalizeStreamMessage: () => {
    set({ streamBuffer: '', streamMessageId: null });
  },
}));
