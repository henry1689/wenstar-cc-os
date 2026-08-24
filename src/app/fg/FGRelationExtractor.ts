/**
 * FGRelationExtractor — LLM 关系识别器（方案C）
 *
 * 使用 LLM 识别和验证人物关系，替代 RAG 低级识别。
 * 解决语音识别错误、关系推导过度泛化等问题。
 * 通过 FamilyGraph 私有 query/run 访问底层 SQL（sql.js 实例无 query 方法）。
 */
import type { FamilyGraph } from '../../m4/household/FamilyGraph.js';

export interface RelationExtractionResult {
  valid: boolean;
  relations: Array<{
    from: string;
    to: string;
    relation: string;
    confidence: number;
    reason: string;
  }>;
  errors: string[];
}

export class FGRelationExtractor {
  private fg: FamilyGraph;
  private llm: any = null;

  constructor(fg: FamilyGraph) {
    this.fg = fg;
  }

  setLLM(llm: any): void {
    this.llm = llm;
  }

  /** 私有 query 透传 */
  private q(sql: string, params?: unknown[]): any[] {
    return (this.fg as any).query(sql, params);
  }

  /** 私有 run 透传 */
  private r(sql: string, params?: unknown[]): void {
    (this.fg as any).run(sql, params);
  }

  /** 清理后强制立即落盘 */
  private flushDirty(): void {
    (this.fg as any).markDirty(true);
  }

  /**
   * 使用 LLM 识别对话中的人物关系
   */
  async extractRelationsFromDialogue(
    dialogue: string,
    context?: { currentTime?: string; speaker?: string }
  ): Promise<RelationExtractionResult> {
    if (!this.llm) {
      return {
        valid: false,
        relations: [],
        errors: ['LLM provider not configured'],
      };
    }

    const prompt = this.buildExtractionPrompt(dialogue, context);
    
    try {
      const response = await this.llm.chat({
        messages: [
          { role: 'system', content: '你是一个关系识别专家，只输出 JSON 格式的关系列表。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        maxTokens: 500,
      });

      return this.parseExtractionResponse(response.content);
    } catch (err) {
      return {
        valid: false,
        relations: [],
        errors: [`LLM extraction failed: ${err}`],
      };
    }
  }

  /**
   * 清理垃圾实体（识别并标记语音识别错误产生的节点）
   */
  async cleanupGarbageNodes(): Promise<{ cleaned: number; garbageNodes: string[] }> {
    if (!this.llm) {
      return { cleaned: 0, garbageNodes: [] };
    }

    const result = this.q("SELECT id, name FROM nodes WHERE type = 'person' AND LENGTH(name) < 6");

    const garbageNodes: string[] = [];

    for (const node of result) {
      if (await this.isGarbageNode(node.name)) {
        garbageNodes.push(node.name);
      }
    }

    // 删除垃圾节点的边和节点
    let changed = 0;
    for (const name of garbageNodes) {
      const nodeId = result.find((n: any) => n.name === name)?.id;
      if (nodeId) {
        this.r('DELETE FROM edges WHERE source_id = ? OR target_id = ?', [nodeId, nodeId]);
        this.r('DELETE FROM nodes WHERE id = ?', [nodeId]);
        changed++;
      }
    }

    if (changed > 0) this.flushDirty();

    return { cleaned: garbageNodes.length, garbageNodes };
  }

  private async isGarbageNode(name: string): Promise<boolean> {
    // 基本规则检查
    if (name.length < 2 || name.length > 6) return true;
    if (/^[一-鿿]+$/.test(name) === false) return true;
    if (/\s/.test(name)) return true;
    if (/^[0-9]/.test(name)) return true;
    
    // LLM 验证
    try {
      const response = await this.llm!.chat({
        messages: [
          { role: 'system', content: '判断这个人名是否是语音识别错误产生的垃圾节点。只输出 true 或 false。' },
          { role: 'user', content: `这个名字是语音识别产生的，判断是否合理：${name}` },
        ],
        temperature: 0,
        maxTokens: 10,
      });
      return response.content.toLowerCase().includes('true');
    } catch {
      return false;
    }
  }

  private buildExtractionPrompt(dialogue: string, context?: any): string {
    return `请从以下对话中提取人物关系：

对话内容：
${dialogue}

${context?.currentTime ? `当前时间：${context.currentTime}` : ''}
${context?.speaker ? `说话人：${context.speaker}` : ''}

输出格式（JSON）：
{
  "relations": [
    {
      "from": "人物A",
      "to": "人物B", 
      "relation": "关系类型",
      "confidence": 0.9,
      "reason": "理由"
    }
  ]
}

关系类型：child_of, parent_of, elder_sister_of, younger_sister_of, spouse_of, colleague_of, friend_of, acquaintance_of
注意：
1. 只提取明确提到的关系
2. 考虑年龄合理性（如 14 岁不可能是 parent_of）
3. 忽略语音识别错误产生的垃圾名称`;
  }

  private parseExtractionResponse(content: string): RelationExtractionResult {
    try {
      const json = content.match(/\{[\s\S]*\}/)?.[0];
      if (!json) throw new Error('No JSON found');
      
      const data = JSON.parse(json);
      return {
        valid: true,
        relations: data.relations || [],
        errors: [],
      };
    } catch {
      return {
        valid: false,
        relations: [],
        errors: ['Failed to parse LLM response'],
      };
    }
  }
}
