import fs from 'fs';
import path from 'path';

export interface AppConfig {
  version: string;
  environment: 'development' | 'staging' | 'production';
  aws: {
    region: string;
    bedrock: {
      region: string;
      modelId: string;
      reasoningModelId?: string; // For complex reasoning tasks (Concept/Architect views)
      maxTokens: number;
      temperature: number;
      topP: number;
    };
    novaAct: {
      agentId: string;
      region: string;
      sessionTimeout: number;
    };
  };
  ui: {
    theme: 'light' | 'dark' | 'auto';
    defaultLayout: {
      algorithm: 'hierarchical' | 'force' | 'grid' | 'manual';
    };
    enableAnimations: boolean;
  };
  validation: {
    enabledRules: string[];
    defaultSeverity: 'error' | 'warning' | 'info';
    autoValidate: boolean;
  };
  workspace: {
    defaultPath: string;
    autoSave: boolean;
    backupEnabled: boolean;
  };
}

let cachedConfig: AppConfig | null = null;

export function loadAppConfig(): AppConfig {
  if (cachedConfig) {
    return cachedConfig;
  }
  
  const configPath = path.join(process.cwd(), 'config/app-config.json');
  
  // Default configuration
  const defaultConfig: AppConfig = {
    version: '1.0.0',
    environment: (process.env.NODE_ENV as any) || 'development',
    aws: {
      region: process.env.AWS_REGION || 'us-east-1',
      bedrock: {
        region: process.env.AWS_REGION || 'us-east-1',
        // Use Amazon Nova Pro - usually available by default, no approval needed
        // Alternative: anthropic.claude-3-5-sonnet-20241022-v2:0 (requires approval)
        modelId: process.env.BEDROCK_MODEL_ID || 'amazon.nova-pro-v1:0',
        // Optional: Use stronger model for complex reasoning (Concept/Architect views)
        // Note: Nova Premier requires inference profile ARN (us.amazon.nova-premier-v1:0)
        reasoningModelId: process.env.BEDROCK_REASONING_MODEL_ID || process.env.BEDROCK_MODEL_ID || 'us.amazon.nova-premier-v1:0',
        maxTokens: parseInt(process.env.BEDROCK_MAX_TOKENS || '8192'), // Increased for complex architecture generation
        temperature: parseFloat(process.env.BEDROCK_TEMPERATURE || '0.7'),
        topP: 0.9
      },
      novaAct: {
        agentId: process.env.NOVA_ACT_AGENT_ID || 'placeholder-agent-id',
        region: process.env.AWS_REGION || 'us-east-1',
        sessionTimeout: 300000
      }
    },
    ui: {
      theme: 'light',
      defaultLayout: {
        algorithm: 'hierarchical'
      },
      enableAnimations: true
    },
    validation: {
      enabledRules: ['connectivity-cpu-memory', 'power-domains', 'clock-domains'],
      defaultSeverity: 'warning',
      autoValidate: true
    },
    workspace: {
      defaultPath: './workspace',
      autoSave: true,
      backupEnabled: true
    }
  };
  
  // Load configuration from file if it exists
  if (fs.existsSync(configPath)) {
    try {
      const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      cachedConfig = { ...defaultConfig, ...fileConfig };
    } catch (error) {
      console.warn('Failed to load config file, using defaults:', error);
      cachedConfig = defaultConfig;
    }
  } else {
    console.log('Config file not found, using defaults');
    cachedConfig = defaultConfig;
  }
  
  return cachedConfig!;
}

export function getAWSConfig() {
  const config = loadAppConfig();
  return {
    region: config.aws.region,
    credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    } : undefined
  };
}

export function getBedrockConfig() {
  const config = loadAppConfig();
  return {
    ...getAWSConfig(),
    ...config.aws.bedrock
  };
}

export function getNovaActConfig() {
  const config = loadAppConfig();
  return {
    ...getAWSConfig(),
    ...config.aws.novaAct
  };
}