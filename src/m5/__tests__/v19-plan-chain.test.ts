/**
 * V19 规划型思维链泄漏 —— 用户实测"那就说说你高潮的时候"
 * 结构: [规划段: 括号列举 + markdown列表 + 编号提纲 + 元认知] + [转场"让我把它写出来"] + [答案]
 * 根因: findAnswerStart 把"（肌肉收缩、呼吸、潮红等）"误判为动作描写（"缩"在 ACTION_VERBS）
 * 期望: 只返回转场后的答案，不含规划段
 */
import { describe, it, expect } from 'vitest';
import { extractAnswerFromReasoning } from '../DeepSeekLLMProvider.js';

const LEAK = `（肌肉收缩、呼吸、潮红等），可以融入我的感受体验中
- 我的角色是清纯、温柔、容易害羞，说话风格要软糯、细腻，使用诗意的比喻
- 必须用"诗雨"自称
- 不能太直白粗俗，要保持我角色的清纯、害羞、惹人怜爱的语气

关于长度，这是描述感受/讲故事式的回答，大概300–500字。

我要怎么用角色的声音来表达，同时融入知识库里的知识？

我想表达：
1. 高潮时的外貌/表情——脸红、身体弓起、手脚蜷曲、呼吸急促
2. 身体反应——心跳加速、身体紧绷后又突然瘫软
3. 特别是下面内部——有节律的痉挛、一下一下地收缩
4. 害羞地承认这些，并求他别继续追问了

我会用较诗意但内含真实生理细节的写法，像是小口含着手指一样的收缩感、一波接一波的热潮等。让我把它写出来，用温柔、低语般的声音。（诗雨整个人都缩进被子角里，只露出一双眼睛，湿漉漉地眨着，好半天才把手机重新贴到耳边，声音像是从嗓子眼里一点点挤出来的。）

鸿艺先生……您是存心要诗雨的命呀。这、这哪是好意思想起来的事……可您一只耳朵都堵到诗雨嘴边了，诗雨再躲，倒显得小气。

（她小口小口喘了一会儿，像给自己鼓劲，才断断续续地开口，声线又软又颤。）

那时诗雨……先是喘不上气，手脚都发麻，脚趾会不自觉地蜷起来，腰也绷着，整个人像被一根线牵着往上弓。`;

describe('V19 规划型思维链剥离', () => {
  it('不泄漏规划段（肌肉收缩/我的角色/我想表达/让我把它写出来）', () => {
    const out = extractAnswerFromReasoning(LEAK);
    console.log('V19_OUT_START>>>' + out.slice(0, 60) + '<<<');
    expect(out).not.toContain('肌肉收缩');
    expect(out).not.toContain('我的角色是');
    expect(out).not.toContain('我想表达');
    expect(out).not.toContain('让我把它写出来');
    expect(out).not.toContain('关于长度');
  });

  it('保留最终答案（"您是存心要诗雨的命"）', () => {
    const out = extractAnswerFromReasoning(LEAK);
    expect(out).toContain('您是存心要诗雨的命');
    expect(out).toContain('诗雨整个人都缩进被子角里');
    expect(out).toContain('整个人像被一根线牵着往上弓');
  });
});

// 反例：正常动作描写答案含"缩"（角色动作），不得被误判为规划段
describe('V19 反例（不误伤正常动作描写）', () => {
  it('动作描写"（她缩了缩身子）"保留', () => {
    const out = extractAnswerFromReasoning('（她缩了缩身子，声音轻了下去。）鸿艺先生，您别这样……');
    console.log('V19_FANLI>>>' + out + '<<<');
    expect(out.trim().length).toBeGreaterThan(0);
    expect(out).toContain('鸿艺先生');
  });
});
