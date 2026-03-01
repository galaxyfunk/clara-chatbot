'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { OnboardingWizard } from './onboarding-wizard';
import type { WorkspaceSettings, OnboardingStepRecord } from '@/types/workspace';
import { DEFAULT_WORKSPACE_SETTINGS } from '@/types/workspace';

interface OnboardingGateProps {
  children: React.ReactNode;
}

const ALL_STEPS = ['name_bot', 'add_knowledge', 'connect_ai', 'preview'] as const;

export function OnboardingGate({ children }: OnboardingGateProps) {
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [settings, setSettings] = useState<WorkspaceSettings>(DEFAULT_WORKSPACE_SETTINGS);
  const [completedSteps, setCompletedSteps] = useState<OnboardingStepRecord[]>([]);

  useEffect(() => {
    async function checkOnboarding() {
      try {
        const res = await fetch('/api/workspace');
        const data = await res.json();

        if (!data.success || !data.workspace) {
          setLoading(false);
          return;
        }

        const mergedSettings = { ...DEFAULT_WORKSPACE_SETTINGS, ...data.workspace.settings };
        setWorkspaceId(data.workspace.id);
        setSettings(mergedSettings);
        setCompletedSteps(mergedSettings.onboarding_completed_steps || []);

        // Check if onboarding is needed
        const completedOrSkipped = mergedSettings.onboarding_completed_steps || [];
        const finishedSteps = completedOrSkipped.map((s: OnboardingStepRecord) => s.step);
        const allStepsComplete = ALL_STEPS.every((step) => finishedSteps.includes(step));

        setShowWizard(!allStepsComplete);
      } catch (err) {
        console.error('Failed to check onboarding:', err);
      }
      setLoading(false);
    }

    checkOnboarding();
  }, []);

  const handleWizardComplete = () => {
    setShowWizard(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="w-6 h-6 animate-spin text-ce-navy" />
      </div>
    );
  }

  return (
    <>
      {showWizard && workspaceId && (
        <OnboardingWizard
          workspaceId={workspaceId}
          settings={settings}
          completedSteps={completedSteps}
          onComplete={handleWizardComplete}
        />
      )}
      {children}
    </>
  );
}
