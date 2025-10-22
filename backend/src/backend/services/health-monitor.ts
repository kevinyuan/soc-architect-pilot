// Health Monitoring Service
// Monitors AWS service connectivity and development environment health

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { BedrockClient, ListFoundationModelsCommand } from '@aws-sdk/client-bedrock';
import { getAWSConfig, getBedrockConfig } from '../config';
import fs from 'fs';
import path from 'path';

export interface ServiceHealth {
  service: string;
  status: 'healthy' | 'degraded' | 'unavailable';
  lastCheck: Date;
  responseTime?: number;
  errorMessage?: string;
  details?: any;
}

export interface SystemHealth {
  overall: 'healthy' | 'degraded' | 'unavailable';
  services: ServiceHealth[];
  timestamp: Date;
  environment: string;
  version: string;
}

class HealthMonitor {
  private healthCache = new Map<string, ServiceHealth>();
  private cacheTimeout = 30000; // 30 seconds

  async checkAWSCredentials(): Promise<ServiceHealth> {
    const startTime = Date.now();
    
    try {
      const config = getAWSConfig();
      const bedrockClient = new BedrockClient(config);
      
      const command = new ListFoundationModelsCommand({});
      await bedrockClient.send(command);
      
      const responseTime = Date.now() - startTime;
      
      return {
        service: 'aws-credentials',
        status: 'healthy',
        lastCheck: new Date(),
        responseTime,
        details: {
          region: config.region,
          credentialsConfigured: !!config.credentials
        }
      };
    } catch (error) {
      return {
        service: 'aws-credentials',
        status: 'unavailable',
        lastCheck: new Date(),
        responseTime: Date.now() - startTime,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        details: {
          errorType: error instanceof Error ? error.constructor.name : 'Unknown'
        }
      };
    }
  }

  async checkBedrockAccess(): Promise<ServiceHealth> {
    const startTime = Date.now();
    
    try {
      const config = getBedrockConfig();
      const bedrockRuntime = new BedrockRuntimeClient(config);

      const isNova = config.modelId.includes('amazon.nova');
      const isClaude = config.modelId.includes('anthropic.claude');
      
      let testPrompt: any;
      if (isNova) {
        testPrompt = {
          messages: [
            {
              role: "user",
              content: [{ text: "Health check test. Please respond with 'OK'." }]
            }
          ],
          inferenceConfig: {
            max_new_tokens: 50,
            temperature: 0.7,
            top_p: 0.9
          }
        };
      } else if (isClaude) {
        testPrompt = {
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: 50,
          messages: [
            {
              role: "user",
              content: "Health check test. Please respond with 'OK'."
            }
          ]
        };
      } else {
        testPrompt = {
          messages: [
            {
              role: "user",
              content: "Health check test. Please respond with 'OK'."
            }
          ],
          max_tokens: 50
        };
      }

      const command = new InvokeModelCommand({
        modelId: config.modelId,
        body: JSON.stringify(testPrompt),
        contentType: 'application/json'
      });

      const response = await bedrockRuntime.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      
      const responseTime = Date.now() - startTime;
      
      // Parse response based on model type
      let testResponse: string;
      if (isNova) {
        testResponse = responseBody.output?.message?.content?.[0]?.text?.substring(0, 50) || 'OK';
      } else if (isClaude) {
        testResponse = responseBody.content?.[0]?.text?.substring(0, 50) || 'OK';
      } else {
        testResponse = (responseBody.content?.[0]?.text || responseBody.text || 'OK').substring(0, 50);
      }
      
      return {
        service: 'bedrock',
        status: 'healthy',
        lastCheck: new Date(),
        responseTime,
        details: {
          modelId: config.modelId,
          region: config.region,
          testResponse
        }
      };
    } catch (error) {
      return {
        service: 'bedrock',
        status: 'unavailable',
        lastCheck: new Date(),
        responseTime: Date.now() - startTime,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        details: {
          errorType: error instanceof Error ? error.constructor.name : 'Unknown'
        }
      };
    }
  }

  async checkComponentLibrary(): Promise<ServiceHealth> {
    const startTime = Date.now();
    
    try {
      const libraryPath = path.join(process.cwd(), 'data/library/component-library.json');
      
      if (!fs.existsSync(libraryPath)) {
        return {
          service: 'component-library',
          status: 'unavailable',
          lastCheck: new Date(),
          responseTime: Date.now() - startTime,
          errorMessage: 'Component library file not found',
          details: {
            expectedPath: libraryPath
          }
        };
      }
      
      const library = JSON.parse(fs.readFileSync(libraryPath, 'utf-8'));
      const responseTime = Date.now() - startTime;
      
      return {
        service: 'component-library',
        status: 'healthy',
        lastCheck: new Date(),
        responseTime,
        details: {
          totalComponents: library.metadata.totalComponents,
          lastUpdated: library.metadata.lastUpdated,
          version: library.metadata.version
        }
      };
    } catch (error) {
      return {
        service: 'component-library',
        status: 'degraded',
        lastCheck: new Date(),
        responseTime: Date.now() - startTime,
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async checkFileSystem(): Promise<ServiceHealth> {
    const startTime = Date.now();
    
    try {
      // Check required directories
      const requiredDirs = [
        'data/components',
        'data/patterns',
        'data/library',
        'workspace',
        'config'
      ];
      
      const missingDirs = requiredDirs.filter(dir => !fs.existsSync(dir));
      
      if (missingDirs.length > 0) {
        return {
          service: 'filesystem',
          status: 'degraded',
          lastCheck: new Date(),
          responseTime: Date.now() - startTime,
          errorMessage: `Missing directories: ${missingDirs.join(', ')}`,
          details: {
            missingDirectories: missingDirs,
            existingDirectories: requiredDirs.filter(dir => fs.existsSync(dir))
          }
        };
      }
      
      // Test write access
      const testFile = path.join(process.cwd(), '.health-check-test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      
      const responseTime = Date.now() - startTime;
      
      return {
        service: 'filesystem',
        status: 'healthy',
        lastCheck: new Date(),
        responseTime,
        details: {
          directories: requiredDirs,
          writeAccess: true
        }
      };
    } catch (error) {
      return {
        service: 'filesystem',
        status: 'unavailable',
        lastCheck: new Date(),
        responseTime: Date.now() - startTime,
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private isCacheValid(service: string): boolean {
    const cached = this.healthCache.get(service);
    if (!cached) return false;
    
    const age = Date.now() - cached.lastCheck.getTime();
    return age < this.cacheTimeout;
  }

  async getServiceHealth(service: string, useCache = true): Promise<ServiceHealth> {
    if (useCache && this.isCacheValid(service)) {
      return this.healthCache.get(service)!;
    }
    
    let health: ServiceHealth;
    
    switch (service) {
      case 'aws-credentials':
        health = await this.checkAWSCredentials();
        break;
      case 'bedrock':
        health = await this.checkBedrockAccess();
        break;
      case 'component-library':
        health = await this.checkComponentLibrary();
        break;
      case 'filesystem':
        health = await this.checkFileSystem();
        break;
      default:
        throw new Error(`Unknown service: ${service}`);
    }
    
    this.healthCache.set(service, health);
    return health;
  }

  async getSystemHealth(): Promise<SystemHealth> {
    const services = ['aws-credentials', 'bedrock', 'component-library', 'filesystem'];
    const healthChecks = await Promise.all(
      services.map(service => this.getServiceHealth(service))
    );
    
    // Determine overall health
    const hasUnavailable = healthChecks.some(h => h.status === 'unavailable');
    const hasDegraded = healthChecks.some(h => h.status === 'degraded');
    
    let overall: 'healthy' | 'degraded' | 'unavailable';
    if (hasUnavailable) {
      overall = 'unavailable';
    } else if (hasDegraded) {
      overall = 'degraded';
    } else {
      overall = 'healthy';
    }
    
    return {
      overall,
      services: healthChecks,
      timestamp: new Date(),
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0'
    };
  }

  async runHealthCheck(): Promise<SystemHealth> {
    console.log('🏥 Running system health check...');
    const health = await this.getSystemHealth();
    
    console.log(`📊 Overall Status: ${health.overall.toUpperCase()}`);
    health.services.forEach(service => {
      const icon = service.status === 'healthy' ? '✅' : 
                   service.status === 'degraded' ? '⚠️' : '❌';
      console.log(`  ${icon} ${service.service}: ${service.status} (${service.responseTime}ms)`);
      if (service.errorMessage) {
        console.log(`    Error: ${service.errorMessage}`);
      }
    });
    
    return health;
  }
}

export const healthMonitor = new HealthMonitor();