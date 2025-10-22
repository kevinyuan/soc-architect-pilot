// Interactive Message Components for Structured AI Interaction
// Renders different types of interactive UI based on AI response

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Edit } from 'lucide-react';

// Type definitions
export interface InteractionOption {
  id: string;
  label: string;
  description?: string;
  recommended?: boolean;
  category?: string;
  specs?: Record<string, any>;
}

export interface ActionButton {
  id: string;
  label: string;
  primary?: boolean;
  secondary?: boolean;
}

export interface StructuredInteraction {
  message: string;
  interactionType: 'checkbox-list' | 'radio-group' | 'multi-param' | 'confirmation' | 'text';
  options?: InteractionOption[];
  specification?: any;
  actions?: ActionButton[];
  allowCustom?: boolean;
}

interface InteractiveMessageProps {
  interaction: StructuredInteraction;
  onResponse: (response: any) => void;
}

export function InteractiveMessage({ interaction, onResponse }: InteractiveMessageProps) {
  switch (interaction.interactionType) {
    case 'checkbox-list':
      return <CheckboxListInteraction interaction={interaction} onResponse={onResponse} />;
    
    case 'radio-group':
      return <RadioGroupInteraction interaction={interaction} onResponse={onResponse} />;
    
    case 'confirmation':
      return <ConfirmationInteraction interaction={interaction} onResponse={onResponse} />;
    
    default:
      return null;
  }
}


// Checkbox List Interaction Component
function CheckboxListInteraction({ 
  interaction, 
  onResponse 
}: { 
  interaction: StructuredInteraction; 
  onResponse: (response: any) => void;
}) {
  const [selected, setSelected] = React.useState<string[]>(
    interaction.options?.filter(o => o.recommended).map(o => o.id) || []
  );

  const handleToggle = (optionId: string) => {
    setSelected(prev => 
      prev.includes(optionId)
        ? prev.filter(id => id !== optionId)
        : [...prev, optionId]
    );
  };

  const handleSubmit = () => {
    onResponse({
      type: 'checkbox-list',
      selected,
      selectedOptions: interaction.options?.filter(o => selected.includes(o.id))
    });
  };

  return (
    <Card className="mt-3 border-primary/30">
      <CardContent className="pt-4 pb-4">
        <p className="text-sm font-medium mb-4">{interaction.message}</p>
        
        <div className="space-y-3">
          {interaction.options?.map(option => (
            <div key={option.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-accent/50 transition-colors">
              <Checkbox
                id={option.id}
                checked={selected.includes(option.id)}
                onCheckedChange={() => handleToggle(option.id)}
                className="mt-1"
              />
              <div className="flex-1">
                <Label htmlFor={option.id} className="cursor-pointer">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{option.label}</span>
                    {option.recommended && (
                      <Badge variant="secondary" className="text-xs">Recommended</Badge>
                    )}
                    {option.category && (
                      <Badge variant="outline" className="text-xs">{option.category}</Badge>
                    )}
                  </div>
                  {option.description && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {option.description}
                    </p>
                  )}
                </Label>
              </div>
            </div>
          ))}
        </div>

        <Button 
          className="mt-4 w-full" 
          onClick={handleSubmit}
          disabled={selected.length === 0}
        >
          <CheckCircle2 className="mr-2 h-4 w-4" />
          Confirm Selection ({selected.length} items)
        </Button>
      </CardContent>
    </Card>
  );
}


// Radio Group Interaction Component
function RadioGroupInteraction({ 
  interaction, 
  onResponse 
}: { 
  interaction: StructuredInteraction; 
  onResponse: (response: any) => void;
}) {
  const [selected, setSelected] = React.useState<string>('');

  const handleSubmit = () => {
    const selectedOption = interaction.options?.find(o => o.id === selected);
    onResponse({
      type: 'radio-group',
      selected,
      selectedOption
    });
  };

  return (
    <Card className="mt-3 border-primary/30">
      <CardContent className="pt-4 pb-4">
        <p className="text-sm font-medium mb-4">{interaction.message}</p>
        
        <RadioGroup value={selected} onValueChange={setSelected}>
          <div className="space-y-3">
            {interaction.options?.map(option => (
              <div key={option.id} className="flex items-start gap-3 p-3 rounded-lg border hover:border-primary/50 transition-colors">
                <RadioGroupItem value={option.id} id={option.id} className="mt-1" />
                <Label htmlFor={option.id} className="flex-1 cursor-pointer">
                  <div className="font-medium">{option.label}</div>
                  {option.description && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {option.description}
                    </p>
                  )}
                  {option.specs && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {Object.entries(option.specs).map(([key, value]) => (
                        <Badge key={key} variant="outline" className="text-xs">
                          {key}: {String(value)}
                        </Badge>
                      ))}
                    </div>
                  )}
                </Label>
              </div>
            ))}
          </div>
        </RadioGroup>

        <Button 
          className="mt-4 w-full" 
          onClick={handleSubmit}
          disabled={!selected}
        >
          <CheckCircle2 className="mr-2 h-4 w-4" />
          Confirm Selection
        </Button>
      </CardContent>
    </Card>
  );
}


// Confirmation Interaction Component
function ConfirmationInteraction({ 
  interaction, 
  onResponse 
}: { 
  interaction: StructuredInteraction; 
  onResponse: (response: any) => void;
}) {
  const spec = interaction.specification;

  return (
    <Card className="mt-3 border-green-500/30 bg-green-50/50 dark:bg-green-950/20">
      <CardContent className="pt-4 pb-4">
        <p className="text-sm font-medium mb-4">{interaction.message}</p>
        
        {spec && (
          <div className="space-y-4">
            {/* Summary */}
            {spec.summary && (
              <div>
                <h4 className="text-sm font-semibold mb-1">Design Overview</h4>
                <p className="text-sm text-muted-foreground">{spec.summary}</p>
              </div>
            )}

            {/* Functions */}
            {spec.functions && spec.functions.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Functional Modules</h4>
                <div className="space-y-1">
                  {spec.functions.map((func: any, idx: number) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{func.name}:</span>
                      <span className="font-medium">{func.spec}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Performance */}
            {spec.performance && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Performance Metrics</h4>
                <div className="space-y-1">
                  {Object.entries(spec.performance).map(([key, value]) => (
                    <div key={key} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{key}:</span>
                      <span className="font-medium">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Interfaces */}
            {spec.interfaces && spec.interfaces.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Interfaces</h4>
                <div className="flex flex-wrap gap-2">
                  {spec.interfaces.map((iface: string, idx: number) => (
                    <Badge key={idx} variant="secondary">{iface}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 mt-4">
          {interaction.actions?.map(action => (
            <Button
              key={action.id}
              variant={action.primary ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => onResponse({ type: 'confirmation', action: action.id })}
            >
              {action.primary && <CheckCircle2 className="mr-2 h-4 w-4" />}
              {action.secondary && <Edit className="mr-2 h-4 w-4" />}
              {action.label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
