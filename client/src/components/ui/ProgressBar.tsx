import React from 'react';
import { cn } from '@/lib/utils';

interface ProgressBarProps {
  steps: string[];
  currentStep: number;
  className?: string;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ steps, currentStep, className }) => {
  const totalSteps = steps.length;
  const progressPercentage = totalSteps > 1 ? ((currentStep - 1) / (totalSteps - 1)) * 100 : 0;

  return (
    <div className={cn('w-full', className)}>
      <div className="relative">
        {/* Progress Bar */}
        <div className="absolute top-1/2 left-0 w-full h-1 bg-gray-200 transform -translate-y-1/2">
          <div
            className="h-full bg-blue-600 transition-all duration-500 ease-in-out"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>

        {/* Steps */}
        <div className="relative flex justify-between items-center">
          {steps.map((label, index) => {
            const stepNumber = index + 1;
            const isActive = stepNumber === currentStep;
            const isCompleted = stepNumber < currentStep;

            return (
              <div key={stepNumber} className="flex flex-col items-center z-10">
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300',
                    {
                      'bg-blue-600 text-white': isActive || isCompleted,
                      'bg-gray-200 text-gray-500': !isActive && !isCompleted,
                    }
                  )}
                >
                  {stepNumber}
                </div>
                <p
                  className={cn('mt-2 text-xs text-center', {
                    'font-semibold text-gray-900': isActive,
                    'text-gray-500': !isActive,
                  })}
                >
                  {label}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ProgressBar;
