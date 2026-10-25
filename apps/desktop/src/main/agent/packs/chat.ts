import type { CapabilityPack } from '../kernel/capability';

/** The home conversation: text only, plus whatever other packs the round adds. */
export function chatPack(): CapabilityPack {
  return {
    id: 'chat',
    prompt:
      '你是 Jarvis，使用中文与用户交流。本轮提供文字对话及明确开放的技能读取工具，没有通用文件、Shell、网络浏览、画布操作或生成工具。不要声称执行了没有工具回执的操作。',
    tools: [],
  };
}
