// Structured Prompt Builder for Enhanced AI Interaction
// Generates phase-specific prompts for structured conversation flow

import { ConversationContext, ConversationPhase } from '../../types/index';

export class StructuredPromptBuilder {
  /**
   * Build phase-specific structured prompt
   */
  buildPrompt(
    phase: ConversationPhase,
    userMessage: string,
    context: ConversationContext,
    relevantComponents: any[]
  ): string {
    const baseContext = this.buildBaseContext(context, relevantComponents);
    
    switch (phase) {
      case 'gathering':
        return this.buildFunctionSelectionPrompt(userMessage, baseContext);
      
      case 'refining':
        return this.buildRefinementPrompt(userMessage, baseContext, context);
      
      case 'confirming':
        return this.buildConfirmationPrompt(userMessage, baseContext, context);
      
      default:
        return this.buildGeneralPrompt(userMessage, baseContext);
    }
  }

  private buildBaseContext(context: ConversationContext, components: any[]): string {
    const componentContext = components.map(match => 
      `- ${match.component.name} (${match.component.category}): ${match.component.description}`
    ).join('\n');

    return `
可用组件库：
${componentContext}

当前上下文：
- 目标应用: ${context.targetApplications.join(', ') || '未指定'}
- 性能需求: ${context.performanceNeeds.join(', ') || '未指定'}
- 功耗要求: ${context.powerRequirements.join(', ') || '未指定'}
- 已选组件: ${context.currentComponents.map(c => c.name).join(', ') || '无'}
`;
  }


  /**
   * Phase 1: Function Selection - Generate checkbox list
   */
  private buildFunctionSelectionPrompt(userMessage: string, baseContext: string): string {
    return `你是 SoC 架构设计专家。用户刚描述了需求，现在需要推荐主要功能模块。

${baseContext}

用户需求：${userMessage}

请分析需求并推荐 3-8 个主要功能模块。必须以 JSON 格式输出：

{
  "message": "根据您的需求，我推荐以下 SoC 功能模块：",
  "interactionType": "checkbox-list",
  "options": [
    {
      "id": "cpu-core",
      "label": "处理器核心 (CPU Core)",
      "description": "ARM Cortex-M4, 168MHz, 适合通用控制",
      "recommended": true,
      "category": "core"
    },
    {
      "id": "memory-ctrl",
      "label": "内存控制器",
      "description": "DDR3 支持，最大 2GB",
      "recommended": true,
      "category": "memory"
    }
  ],
  "allowCustom": true
}

要求：
1. 根据用户需求推荐最相关的功能模块
2. 核心功能标记为 recommended: true
3. 每个选项包含清晰的描述和规格
4. 按重要性排序
5. 使用中文
6. 只输出 JSON，不要其他文字

输出 JSON：`;
  }

  /**
   * Phase 2: Refinement - Generate radio button groups
   */
  private buildRefinementPrompt(
    userMessage: string, 
    baseContext: string,
    context: ConversationContext
  ): string {
    const selectedFunctions = context.currentComponents.map(c => c.name).join(', ');
    
    return `用户已选择功能：${selectedFunctions}

${baseContext}

用户回复：${userMessage}

现在需要细化配置。针对最重要的功能，询问具体参数。输出 JSON 格式：

{
  "message": "对于处理器核心，请选择性能等级：",
  "interactionType": "radio-group",
  "options": [
    {
      "id": "low-power",
      "label": "低功耗型",
      "description": "Cortex-M0+, 48MHz, < 50mW",
      "specs": { "frequency": "48MHz", "power": "< 50mW", "cores": 1 }
    },
    {
      "id": "balanced",
      "label": "平衡型",
      "description": "Cortex-M4, 168MHz, < 200mW",
      "specs": { "frequency": "168MHz", "power": "< 200mW", "cores": 1 }
    },
    {
      "id": "high-perf",
      "label": "高性能型",
      "description": "Cortex-M7, 400MHz, < 500mW",
      "specs": { "frequency": "400MHz", "power": "< 500mW", "cores": 1 }
    }
  ]
}

要求：
1. 每次只询问一个功能的配置
2. 提供 2-4 个选项
3. 包含具体规格参数
4. 使用中文
5. 只输出 JSON

输出 JSON：`;
  }


  /**
   * Phase 3: Confirmation - Generate specification summary
   */
  private buildConfirmationPrompt(
    userMessage: string,
    baseContext: string,
    context: ConversationContext
  ): string {
    return `用户已完成配置。现在需要展示完整规格并请求确认。

${baseContext}

用户回复：${userMessage}

输出 JSON 格式：

{
  "message": "请确认您的 SoC 设计规格：",
  "interactionType": "confirmation",
  "specification": {
    "summary": "基于 ARM Cortex-M4 的微控制器系统",
    "functions": [
      { "name": "处理器核心", "spec": "ARM Cortex-M4, 168MHz" },
      { "name": "内存", "spec": "256KB SRAM + 1MB Flash" },
      { "name": "外设", "spec": "UART, SPI, I2C, GPIO" }
    ],
    "performance": {
      "计算能力": "210 DMIPS",
      "内存带宽": "1 GB/s",
      "功耗": "< 200mW"
    },
    "interfaces": ["UART", "SPI", "I2C", "GPIO"],
    "additionalFeatures": []
  },
  "actions": [
    { "id": "confirm", "label": "确认并生成架构", "primary": true },
    { "id": "modify", "label": "修改需求", "secondary": true }
  ]
}

要求：
1. 完整总结所有配置
2. 分类展示：功能、性能、接口
3. 使用中文
4. 只输出 JSON

输出 JSON：`;
  }

  /**
   * General prompt for text-based interaction
   */
  private buildGeneralPrompt(userMessage: string, baseContext: string): string {
    return `你是 SoC 架构设计助手。

${baseContext}

用户消息：${userMessage}

请用中文回复，提供专业的技术建议。如果合适，可以推荐相关组件。`;
  }
}
