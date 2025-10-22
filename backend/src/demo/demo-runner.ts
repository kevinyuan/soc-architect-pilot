import { WorkspaceService } from '../utils/workspace';
import { ConversationalAgent } from '../backend/services/conversational-agent';
import { ComponentLibraryManager } from '../backend/services/component-library-manager';
import { DiagramGenerator } from '../backend/services/diagram-generator';
import { DesignValidationService } from '../backend/services/design-validation-service';
import { demoScenarios, demoComponents, demoValidationRules } from './soc-examples';
import { hackathonDemoScripts, expectedValidationOutputs } from './demo-scripts';
import { Project, DesignSession, ValidationResult } from '../types/index';

export interface DemoExecutionResult {
  success: boolean;
  scenario: string;
  duration: number;
  steps: DemoStepResult[];
  validationResults?: ValidationResult[];
  generatedDiagram?: any;
  errors: string[];
}

export interface DemoStepResult {
  stepId: string;
  success: boolean;
  duration: number;
  output?: any;
  error?: string;
}

export class DemoRunner {
  private workspaceService: WorkspaceService;
  private conversationalAgent: ConversationalAgent;
  private componentLibrary: ComponentLibraryManager;
  private diagramGenerator: DiagramGenerator;
  private validationService: DesignValidationService;

  constructor() {
    this.workspaceService = new WorkspaceService('./demo-workspace');
    this.componentLibrary = new ComponentLibraryManager();
    this.conversationalAgent = new ConversationalAgent(this.componentLibrary);
    this.diagramGenerator = new DiagramGenerator(this.componentLibrary);
    this.validationService = new DesignValidationService();
  }

  async initialize(): Promise<void> {
    try {
      // Initialize workspace
      await this.workspaceService.initializeWorkspace();
      
      // Load demo components into library
      for (const component of demoComponents) {
        await this.componentLibrary.addComponent(component);
      }
      
      // Initialize validation rules
      for (const rule of demoValidationRules) {
        await this.validationService.addRule({
          ...rule,
          validate: async () => [] // Placeholder implementation
        });
      }
      
      console.log('Demo runner initialized successfully');
    } catch (error) {
      console.error('Failed to initialize demo runner:', error);
      throw error;
    }
  }

  async runDemoScenario(scenarioName: 'microcontroller' | 'applicationProcessor'): Promise<DemoExecutionResult> {
    const startTime = Date.now();
    const scenario = demoScenarios[scenarioName];
    const steps: DemoStepResult[] = [];
    const errors: string[] = [];

    try {
      console.log(`Starting demo scenario: ${scenario.name}`);

      // Step 1: Create project
      const projectStep = await this.executeStep('create-project', async () => {
        return await this.workspaceService.createProject({
          name: `Demo: ${scenario.name}`,
          description: scenario.description,
          tags: ['demo', scenarioName],
          sessions: [],
          diagrams: [],
          specifications: []
        });
      });
      steps.push(projectStep);

      if (!projectStep.success) {
        throw new Error('Failed to create demo project');
      }

      const project = projectStep.output as Project;

      // Step 2: Start conversation session
      const sessionStep = await this.executeStep('start-session', async () => {
        const session = this.workspaceService.startConversation();
        session.currentArchitecture = scenario.architecture;
        await this.workspaceService.saveSession(project.id, session);
        return session;
      });
      steps.push(sessionStep);

      if (!sessionStep.success) {
        throw new Error('Failed to start conversation session');
      }

      const session = sessionStep.output as DesignSession;

      // Step 3: Simulate conversation flow
      const conversationStep = await this.executeStep('conversation-flow', async () => {
        const conversationHistory = [];
        
        for (const turn of scenario.conversationFlow) {
          conversationHistory.push({
            id: `msg-${Date.now()}-${Math.random()}`,
            sessionId: session.sessionId,
            role: turn.user ? 'user' : 'assistant',
            content: turn.user || turn.assistant,
            timestamp: new Date()
          });
        }

        session.conversationHistory = conversationHistory;
        await this.workspaceService.saveSession(project.id, session);
        return conversationHistory;
      });
      steps.push(conversationStep);

      // Step 4: Generate diagram
      const diagramStep = await this.executeStep('generate-diagram', async () => {
        const diagramData = await this.diagramGenerator.generateDiagram(scenario.architecture);
        const diagramId = `demo-diagram-${Date.now()}`;
        await this.workspaceService.saveDiagram(project.id, diagramId, diagramData);
        return diagramData;
      });
      steps.push(diagramStep);

      // Step 5: Run validation
      const validationStep = await this.executeStep('run-validation', async () => {
        const spec = {
          id: `demo-spec-${scenarioName}`,
          name: scenario.name,
          description: scenario.description,
          components: scenario.architecture.selectedComponents,
          connections: [],
          requirements: scenario.architecture.performanceRequirements,
          constraints: scenario.architecture.constraints,
          performanceTargets: {},
          createdAt: new Date(),
          lastModified: new Date(),
          version: '1.0.0',
          powerBudget: scenario.powerBudget,
          areaBudget: scenario.areaBudget,
          targetMarket: scenario.targetMarket
        };

        return await this.validationService.validateDesign(spec);
      });
      steps.push(validationStep);

      const duration = Date.now() - startTime;

      return {
        success: true,
        scenario: scenarioName,
        duration,
        steps,
        validationResults: validationStep.output as ValidationResult[],
        generatedDiagram: diagramStep.output,
        errors
      };

    } catch (error: any) {
      errors.push(error.message);
      const duration = Date.now() - startTime;

      return {
        success: false,
        scenario: scenarioName,
        duration,
        steps,
        errors
      };
    }
  }

  async runValidationDemo(): Promise<DemoExecutionResult> {
    const startTime = Date.now();
    const steps: DemoStepResult[] = [];
    const errors: string[] = [];

    try {
      console.log('Starting validation system demo');

      // Step 1: Show existing rules
      const rulesStep = await this.executeStep('list-rules', async () => {
        return await this.validationService.listRules();
      });
      steps.push(rulesStep);

      // Step 2: Add custom security rule
      const customRuleStep = await this.executeStep('add-custom-rule', async () => {
        const securityRule = {
          id: 'demo-security-check',
          name: 'Security Feature Validation',
          description: 'Validates security features in IoT devices',
          category: 'custom' as const,
          severity: 'warning' as const,
          enabled: true,
          priority: 5,
          validate: async (spec: any) => {
            const results = [];
            
            const hasEncryption = spec.components.some((component: any) => 
              component.tags.includes('encryption') || 
              component.tags.includes('crypto')
            );
            
            if (!hasEncryption) {
              results.push({
                ruleId: 'demo-security-check',
                severity: 'warning' as const,
                message: 'IoT device should include encryption/security features',
                affectedComponents: [],
                suggestedFix: 'Consider adding a crypto accelerator or secure element',
                confidence: 0.8,
                category: 'custom' as const,
                timestamp: new Date()
              });
            }
            
            return results;
          }
        };

        await this.validationService.addRule(securityRule);
        return securityRule;
      });
      steps.push(customRuleStep);

      // Step 3: Run validation with new rule
      const validationStep = await this.executeStep('validate-with-custom-rule', async () => {
        const iotSpec = {
          id: 'demo-iot-spec',
          name: 'Demo IoT Device',
          description: 'IoT device for validation demo',
          components: demoScenarios.microcontroller.architecture.selectedComponents,
          connections: [],
          requirements: [],
          constraints: [],
          performanceTargets: {},
          createdAt: new Date(),
          lastModified: new Date(),
          version: '1.0.0'
        };

        return await this.validationService.validateDesign(iotSpec);
      });
      steps.push(validationStep);

      const duration = Date.now() - startTime;

      return {
        success: true,
        scenario: 'validation-demo',
        duration,
        steps,
        validationResults: validationStep.output as ValidationResult[],
        errors
      };

    } catch (error: any) {
      errors.push(error.message);
      const duration = Date.now() - startTime;

      return {
        success: false,
        scenario: 'validation-demo',
        duration,
        steps,
        errors
      };
    }
  }

  async runFullDemo(): Promise<DemoExecutionResult[]> {
    console.log('Starting full demo suite...');
    
    const results: DemoExecutionResult[] = [];

    // Run IoT microcontroller demo
    const iotResult = await this.runDemoScenario('microcontroller');
    results.push(iotResult);

    // Run application processor demo
    const appProcessorResult = await this.runDemoScenario('applicationProcessor');
    results.push(appProcessorResult);

    // Run validation system demo
    const validationResult = await this.runValidationDemo();
    results.push(validationResult);

    return results;
  }

  private async executeStep(stepId: string, operation: () => Promise<any>): Promise<DemoStepResult> {
    const startTime = Date.now();
    
    try {
      console.log(`Executing step: ${stepId}`);
      const output = await operation();
      const duration = Date.now() - startTime;
      
      return {
        stepId,
        success: true,
        duration,
        output
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`Step ${stepId} failed:`, error);
      
      return {
        stepId,
        success: false,
        duration,
        error: error.message
      };
    }
  }

  async generateDemoReport(results: DemoExecutionResult[]): Promise<string> {
    const totalDuration = results.reduce((sum, result) => sum + result.duration, 0);
    const successCount = results.filter(r => r.success).length;
    
    const report = {
      summary: {
        totalScenarios: results.length,
        successfulScenarios: successCount,
        totalDuration: totalDuration,
        overallSuccess: successCount === results.length
      },
      scenarios: results.map(result => ({
        scenario: result.scenario,
        success: result.success,
        duration: result.duration,
        stepCount: result.steps.length,
        validationResults: result.validationResults?.length || 0,
        errors: result.errors
      })),
      timestamp: new Date().toISOString()
    };

    return JSON.stringify(report, null, 2);
  }

  async cleanup(): Promise<void> {
    try {
      // Clean up demo workspace
      console.log('Cleaning up demo environment...');
      // Implementation would clean up temporary files and resources
    } catch (error) {
      console.error('Cleanup failed:', error);
    }
  }
}

// CLI interface for running demos
export async function runDemoFromCLI(scenario?: string): Promise<void> {
  const runner = new DemoRunner();
  
  try {
    await runner.initialize();
    
    let results: DemoExecutionResult[];
    
    if (scenario === 'iot') {
      results = [await runner.runDemoScenario('microcontroller')];
    } else if (scenario === 'app-processor') {
      results = [await runner.runDemoScenario('applicationProcessor')];
    } else if (scenario === 'validation') {
      results = [await runner.runValidationDemo()];
    } else {
      results = await runner.runFullDemo();
    }
    
    const report = await runner.generateDemoReport(results);
    console.log('\n=== DEMO RESULTS ===');
    console.log(report);
    
    const overallSuccess = results.every(r => r.success);
    process.exit(overallSuccess ? 0 : 1);
    
  } catch (error) {
    console.error('Demo execution failed:', error);
    process.exit(1);
  } finally {
    await runner.cleanup();
  }
}

// Export for use in other modules
export default DemoRunner;