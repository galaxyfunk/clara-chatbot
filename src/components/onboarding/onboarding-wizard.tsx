'use client';

import { useState, useEffect } from 'react';
import { CheckCircle, Circle, Loader2, ArrowRight, ArrowLeft, X, Send } from 'lucide-react';
import type { WorkspaceSettings, OnboardingStepRecord, OnboardingStep } from '@/types/workspace';
import { DEFAULT_WORKSPACE_SETTINGS } from '@/types/workspace';
import { SUPPORTED_MODELS, type LLMModel } from '@/types/api-keys';

interface OnboardingWizardProps {
  workspaceId: string;
  settings: WorkspaceSettings;
  completedSteps: OnboardingStepRecord[];
  onComplete: () => void;
}

const STEPS: { id: OnboardingStep; label: string; description: string }[] = [
  { id: 'name_bot', label: 'Name Your Bot', description: 'Give your chatbot a name and welcome message' },
  { id: 'add_knowledge', label: 'Add Knowledge', description: 'Add at least one Q&A pair' },
  { id: 'connect_ai', label: 'Connect AI', description: 'Add your API key' },
  { id: 'preview', label: 'Preview', description: 'Test your chatbot' },
];

export function OnboardingWizard({
  workspaceId,
  settings: initialSettings,
  completedSteps: initialCompletedSteps,
  onComplete,
}: OnboardingWizardProps) {
  // Find first incomplete step
  const getFirstIncompleteStep = (completed: OnboardingStepRecord[]): number => {
    const finishedIds = completed.map((s) => s.step);
    const idx = STEPS.findIndex((s) => !finishedIds.includes(s.id));
    return idx === -1 ? STEPS.length - 1 : idx;
  };

  const [currentStep, setCurrentStep] = useState(() => getFirstIncompleteStep(initialCompletedSteps));
  const [completedSteps, setCompletedSteps] = useState<OnboardingStepRecord[]>(initialCompletedSteps);
  const [saving, setSaving] = useState(false);

  // Step 1: Name Bot
  const [displayName, setDisplayName] = useState(initialSettings.display_name || 'Assistant');
  const [welcomeMessage, setWelcomeMessage] = useState(
    initialSettings.welcome_message || DEFAULT_WORKSPACE_SETTINGS.welcome_message
  );

  // Step 2: Add Knowledge
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [qaAdded, setQaAdded] = useState(false);

  // Step 3: Connect AI
  const [provider, setProvider] = useState<'anthropic' | 'openai'>('anthropic');
  const [model, setModel] = useState('claude-sonnet-4-20250514');
  const [apiKey, setApiKey] = useState('');
  const [keyTested, setKeyTested] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  // Step 4: Preview
  const [previewMessages, setPreviewMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [previewInput, setPreviewInput] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewSessionToken] = useState(() => `onboarding-${Date.now()}`);
  const [messageSent, setMessageSent] = useState(false);

  // Check if step 2 was already done (has Q&A pairs)
  useEffect(() => {
    async function checkKnowledge() {
      try {
        const res = await fetch('/api/qa-pairs');
        const data = await res.json();
        if (data.success && data.pairs && data.pairs.length > 0) {
          setQaAdded(true);
        }
      } catch {
        // Ignore
      }
    }
    checkKnowledge();
  }, []);

  // Check if step 3 was already done (has API keys)
  useEffect(() => {
    async function checkApiKeys() {
      try {
        const res = await fetch('/api/api-keys');
        const data = await res.json();
        if (data.success && data.keys && data.keys.length > 0) {
          setKeyTested(true);
        }
      } catch {
        // Ignore
      }
    }
    checkApiKeys();
  }, []);

  const isStepCompleted = (stepId: OnboardingStep): boolean => {
    return completedSteps.some((s) => s.step === stepId);
  };

  const markStepComplete = async (stepId: OnboardingStep, status: 'completed' | 'skipped') => {
    const newRecord: OnboardingStepRecord = {
      step: stepId,
      status,
      completed_at: new Date().toISOString(),
    };

    const updated = [...completedSteps.filter((s) => s.step !== stepId), newRecord];
    setCompletedSteps(updated);

    // Save to workspace
    try {
      await fetch('/api/workspace', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: { onboarding_completed_steps: updated },
        }),
      });
    } catch (err) {
      console.error('Failed to save onboarding progress:', err);
    }
  };

  const handleNext = async () => {
    setSaving(true);
    const currentStepId = STEPS[currentStep].id;

    // Complete current step
    await markStepComplete(currentStepId, 'completed');

    // Handle step-specific saves
    if (currentStepId === 'name_bot') {
      try {
        await fetch('/api/workspace', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            settings: { display_name: displayName, welcome_message: welcomeMessage },
          }),
        });
      } catch {
        // Continue anyway
      }
    }

    setSaving(false);

    // Move to next step or complete
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handleSkip = async () => {
    const currentStepId = STEPS[currentStep].id;
    await markStepComplete(currentStepId, 'skipped');

    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Step 2: Add Q&A
  const handleAddQA = async () => {
    if (!question.trim() || !answer.trim()) return;
    setSaving(true);

    try {
      const res = await fetch('/api/qa-pairs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, answer, category: 'general' }),
      });
      const data = await res.json();
      if (data.success) {
        setQaAdded(true);
        setQuestion('');
        setAnswer('');
      }
    } catch {
      // Ignore
    }
    setSaving(false);
  };

  // Step 3: Test API Key
  const handleTestKey = async () => {
    if (!apiKey.trim()) return;
    setTesting(true);
    setKeyError(null);

    try {
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          model,
          key: apiKey,
          label: 'Default Key',
          is_default: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setKeyTested(true);
        setApiKey('');
      } else {
        setKeyError(data.error || 'Invalid API key');
      }
    } catch {
      setKeyError('Failed to test key');
    }
    setTesting(false);
  };

  // Step 4: Send preview message
  const handlePreviewSend = async () => {
    if (!previewInput.trim() || previewLoading) return;

    const userContent = previewInput.trim();
    setPreviewMessages((prev) => [...prev, { role: 'user', content: userContent }]);
    setPreviewInput('');
    setPreviewLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: workspaceId,
          session_token: previewSessionToken,
          message: userContent,
          message_id: `preview-${Date.now()}`,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPreviewMessages((prev) => [...prev, { role: 'assistant', content: data.answer }]);
        setMessageSent(true);
      } else {
        setPreviewMessages((prev) => [...prev, { role: 'assistant', content: data.error || 'Error occurred' }]);
      }
    } catch {
      setPreviewMessages((prev) => [...prev, { role: 'assistant', content: 'Failed to connect' }]);
    }
    setPreviewLoading(false);
  };

  const canProceed = (): boolean => {
    const step = STEPS[currentStep].id;
    switch (step) {
      case 'name_bot':
        return displayName.trim().length > 0;
      case 'add_knowledge':
        return qaAdded;
      case 'connect_ai':
        return keyTested;
      case 'preview':
        return messageSent;
      default:
        return true;
    }
  };

  const filteredModels = SUPPORTED_MODELS.filter((m) => m.provider === provider);

  return (
    <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
      <div className="min-h-screen flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 border-b border-gray-200 bg-white">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Set Up Your Chatbot</h1>
              <p className="text-sm text-gray-500">
                Step {currentStep + 1} of {STEPS.length}: {STEPS[currentStep].label}
              </p>
            </div>
            <button
              onClick={onComplete}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
              title="Skip setup"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Progress bar */}
          <div className="max-w-4xl mx-auto px-4 pb-4">
            <div className="flex items-center gap-2">
              {STEPS.map((step, idx) => (
                <div key={step.id} className="flex items-center flex-1">
                  <div
                    className={`flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0 ${
                      idx < currentStep || isStepCompleted(step.id)
                        ? 'bg-green-500 text-white'
                        : idx === currentStep
                        ? 'bg-ce-navy text-white'
                        : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    {idx < currentStep || isStepCompleted(step.id) ? (
                      <CheckCircle className="w-5 h-5" />
                    ) : (
                      <span className="text-sm font-medium">{idx + 1}</span>
                    )}
                  </div>
                  {idx < STEPS.length - 1 && (
                    <div
                      className={`flex-1 h-1 mx-2 rounded ${
                        idx < currentStep ? 'bg-green-500' : 'bg-gray-200'
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="flex mt-2">
              {STEPS.map((step, idx) => (
                <div key={step.id} className="flex-1 text-center">
                  <span
                    className={`text-xs ${
                      idx === currentStep ? 'text-ce-navy font-medium' : 'text-gray-400'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-lg">
            {/* Step 1: Name Bot */}
            {currentStep === 0 && (
              <div className="space-y-6">
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-gray-900">Name Your Bot</h2>
                  <p className="mt-2 text-gray-500">
                    Choose a name and welcome message for your chatbot
                  </p>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="e.g., Clara, Support Bot, Sales Assistant"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-ce-navy focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Welcome Message
                    </label>
                    <textarea
                      value={welcomeMessage}
                      onChange={(e) => setWelcomeMessage(e.target.value)}
                      rows={3}
                      placeholder="Hi! How can I help you today?"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-ce-navy focus:border-transparent resize-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Add Knowledge */}
            {currentStep === 1 && (
              <div className="space-y-6">
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-gray-900">Add Knowledge</h2>
                  <p className="mt-2 text-gray-500">
                    Add at least one Q&A pair to get started
                  </p>
                </div>

                {qaAdded ? (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
                    <CheckCircle className="w-6 h-6 text-green-500 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-green-800">Knowledge added!</p>
                      <p className="text-sm text-green-600">
                        You can add more Q&A pairs in the dashboard later.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Question
                      </label>
                      <input
                        type="text"
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        placeholder="What does your company do?"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-ce-navy focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Answer
                      </label>
                      <textarea
                        value={answer}
                        onChange={(e) => setAnswer(e.target.value)}
                        rows={4}
                        placeholder="We help businesses..."
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-ce-navy focus:border-transparent resize-none"
                      />
                    </div>
                    <button
                      onClick={handleAddQA}
                      disabled={!question.trim() || !answer.trim() || saving}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-ce-navy text-white rounded-lg hover:bg-ce-navy/90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                      Add Q&A Pair
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Connect AI */}
            {currentStep === 2 && (
              <div className="space-y-6">
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-gray-900">Connect AI</h2>
                  <p className="mt-2 text-gray-500">
                    Add your LLM API key to power your chatbot
                  </p>
                </div>

                {keyTested ? (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
                    <CheckCircle className="w-6 h-6 text-green-500 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-green-800">API key connected!</p>
                      <p className="text-sm text-green-600">
                        Your chatbot is ready to respond.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setProvider('anthropic');
                          setModel('claude-sonnet-4-20250514');
                        }}
                        className={`flex-1 px-4 py-2 rounded-lg border-2 transition-colors ${
                          provider === 'anthropic'
                            ? 'border-ce-navy bg-ce-navy/5 text-ce-navy'
                            : 'border-gray-200 text-gray-600'
                        }`}
                      >
                        Anthropic
                      </button>
                      <button
                        onClick={() => {
                          setProvider('openai');
                          setModel('gpt-4o');
                        }}
                        className={`flex-1 px-4 py-2 rounded-lg border-2 transition-colors ${
                          provider === 'openai'
                            ? 'border-ce-navy bg-ce-navy/5 text-ce-navy'
                            : 'border-gray-200 text-gray-600'
                        }`}
                      >
                        OpenAI
                      </button>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Model
                      </label>
                      <select
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-ce-navy focus:border-transparent"
                      >
                        {filteredModels.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        API Key
                      </label>
                      <input
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder={provider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-ce-navy focus:border-transparent font-mono"
                      />
                    </div>
                    {keyError && (
                      <p className="text-sm text-red-600">{keyError}</p>
                    )}
                    <button
                      onClick={handleTestKey}
                      disabled={!apiKey.trim() || testing}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-ce-navy text-white rounded-lg hover:bg-ce-navy/90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {testing && <Loader2 className="w-4 h-4 animate-spin" />}
                      Test & Save Key
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Step 4: Preview */}
            {currentStep === 3 && (
              <div className="space-y-6">
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-gray-900">Test Your Chatbot</h2>
                  <p className="mt-2 text-gray-500">
                    Send a message to see your chatbot in action
                  </p>
                </div>

                <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                  {/* Mini chat header */}
                  <div className="bg-ce-navy px-4 py-3 flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-sm font-medium">
                      {displayName.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-white font-medium">{displayName}</span>
                  </div>

                  {/* Messages */}
                  <div className="h-64 overflow-y-auto p-4 space-y-3">
                    {/* Welcome */}
                    <div className="flex items-start gap-2">
                      <div className="w-6 h-6 rounded-full bg-ce-navy flex-shrink-0 flex items-center justify-center text-white text-xs">
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                      <div className="bg-gray-200 rounded-lg px-3 py-2 text-sm max-w-[80%]">
                        {welcomeMessage}
                      </div>
                    </div>

                    {/* Conversation */}
                    {previewMessages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`flex items-start gap-2 ${msg.role === 'user' ? 'justify-end' : ''}`}
                      >
                        {msg.role === 'assistant' && (
                          <div className="w-6 h-6 rounded-full bg-ce-navy flex-shrink-0 flex items-center justify-center text-white text-xs">
                            {displayName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div
                          className={`rounded-lg px-3 py-2 text-sm max-w-[80%] ${
                            msg.role === 'user' ? 'bg-ce-navy text-white' : 'bg-gray-200'
                          }`}
                        >
                          {msg.content}
                        </div>
                      </div>
                    ))}

                    {previewLoading && (
                      <div className="flex items-center gap-2 text-gray-500">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm">{displayName} is typing...</span>
                      </div>
                    )}
                  </div>

                  {/* Input */}
                  <div className="border-t border-gray-200 p-3 bg-white">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={previewInput}
                        onChange={(e) => setPreviewInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handlePreviewSend()}
                        placeholder="Type a test message..."
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-ce-navy"
                      />
                      <button
                        onClick={handlePreviewSend}
                        disabled={!previewInput.trim() || previewLoading}
                        className="p-2 bg-ce-navy text-white rounded-full disabled:opacity-50"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {messageSent && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span className="text-sm text-green-700">Your chatbot is working!</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-gray-200 bg-white">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
            <div>
              {currentStep > 0 && (
                <button
                  onClick={handleBack}
                  className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleSkip}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                Skip
              </button>
              <button
                onClick={handleNext}
                disabled={!canProceed() || saving}
                className="flex items-center gap-2 px-6 py-2 bg-ce-navy text-white rounded-lg hover:bg-ce-navy/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {currentStep === STEPS.length - 1 ? 'Complete Setup' : 'Continue'}
                {currentStep < STEPS.length - 1 && <ArrowRight className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
