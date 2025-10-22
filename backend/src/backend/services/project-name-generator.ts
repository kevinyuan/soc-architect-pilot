/**
 * Project Name Generator Service
 * Uses fast, cost-effective Claude model to generate meaningful project names
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { getAWSConfig } from '../config';

export class ProjectNameGenerator {
  private bedrockClient: BedrockRuntimeClient;

  constructor() {
    const awsConfig = getAWSConfig();
    this.bedrockClient = new BedrockRuntimeClient({
      region: awsConfig.region,
      credentials: awsConfig.credentials
    });
  }

  /**
   * Generate a meaningful project name from user requirements
   * Uses Claude Haiku for fast, low-cost generation
   * Appends mmdd-hhmm timestamp to ensure uniqueness
   */
  async generateProjectName(userMessage: string): Promise<string> {
    const prompt = `Based on this SoC project requirement, generate a concise, professional project name (2-4 words, lowercase, hyphen-separated).

User requirement: "${userMessage}"

Rules:
- Use technical terms related to the chip/SoC domain
- Keep it professional and descriptive
- 2-4 words maximum
- Use lowercase letters and hyphens only
- No timestamps or random characters
- Examples: "iot-sensor-chip", "high-perf-ai-accelerator", "low-power-audio-processor"

Return ONLY the project name, nothing else.`;

    try {
      // Use Amazon Nova Lite - fastest and most cost-effective for simple tasks
      // Falls back to Nova Pro if Lite is not available
      const modelId = process.env.BEDROCK_MODEL_ID || 'amazon.nova-lite-v1:0';
      const isNova = modelId.includes('amazon.nova');
      const isClaude = modelId.includes('anthropic.claude');
      
      let requestBody: any;
      
      if (isNova) {
        // Amazon Nova format
        requestBody = {
          messages: [
            {
              role: 'user',
              content: [{ text: prompt }]
            }
          ],
          inferenceConfig: {
            max_new_tokens: 100,
            temperature: 0.7,
            top_p: 0.9
          }
        };
      } else if (isClaude) {
        // Claude format (fallback)
        requestBody = {
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: 100,
          temperature: 0.7,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ]
        };
      } else {
        // Generic format
        requestBody = {
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 100,
          temperature: 0.7
        };
      }
      
      const command = new InvokeModelCommand({
        modelId: modelId,
        body: JSON.stringify(requestBody),
        contentType: 'application/json',
        accept: 'application/json'
      });

      const response = await this.bedrockClient.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      
      // Parse response based on model type
      let projectName: string;
      if (isNova) {
        projectName = responseBody.output.message.content[0].text.trim().toLowerCase();
      } else if (isClaude) {
        projectName = responseBody.content[0].text.trim().toLowerCase();
      } else {
        projectName = (responseBody.content?.[0]?.text || responseBody.text || '').trim().toLowerCase();
      }

      // Validate and sanitize the project name
      const baseName = this.sanitizeProjectName(projectName);
      
      // Add timestamp (mmdd-hhmm format)
      const timestamp = this.generateTimestamp();
      return `${baseName}-${timestamp}`;
    } catch (error) {
      console.error('Failed to generate project name with AI:', error);
      // Fallback to simple generation
      const fallbackName = this.generateFallbackName(userMessage);
      const timestamp = this.generateTimestamp();
      return `${fallbackName}-${timestamp}`;
    }
  }

  /**
   * Generate timestamp in mmdd-hhmm format
   */
  private generateTimestamp(): string {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${month}${day}-${hours}${minutes}`;
  }

  /**
   * Sanitize project name to ensure it's valid
   */
  private sanitizeProjectName(name: string): string {
    // Remove any non-alphanumeric characters except hyphens
    let sanitized = name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens

    // Ensure it's not too long
    if (sanitized.length > 50) {
      sanitized = sanitized.substring(0, 50).replace(/-[^-]*$/, ''); // Cut at last complete word
    }

    // Ensure it's not empty
    if (!sanitized || sanitized.length < 3) {
      sanitized = 'soc-project';
    }

    return sanitized;
  }

  /**
   * Generate fallback name if AI generation fails
   */
  private generateFallbackName(message: string): string {
    // Extract keywords from the message
    const words = message
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(word =>
        word.length > 2 &&
        !['the', 'and', 'for', 'with', 'need', 'want', 'create', 'build', 'make', 'design'].includes(word)
      );

    // Take first 3 meaningful words
    const keywords = words.slice(0, 3).join('-');

    return keywords || 'soc-project';
  }
}
