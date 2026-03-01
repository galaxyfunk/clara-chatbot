'use client';

import { useState, useEffect, useRef } from 'react';
import { CheckCircle, Loader2, ArrowRight, ArrowLeft, X, Send, Upload, FileText, MessageSquarePlus, Check, ExternalLink } from 'lucide-react';
import type { WorkspaceSettings, OnboardingStepRecord, OnboardingStep } from '@/types/workspace';
import { DEFAULT_WORKSPACE_SETTINGS } from '@/types/workspace';
import { SUPPORTED_MODELS } from '@/types/api-keys';

interface OnboardingWizardProps {
  workspaceId: string;
  settings: WorkspaceSettings;
  completedSteps: OnboardingStepRecord[];
  onComplete: () => void;
}

const STEPS: { id: OnboardingStep; label: string; description: string }[] = [
  { id: 'name_bot', label: 'Name Your Bot', description: 'Give your chatbot a name and welcome message' },
  { id: 'add_knowledge', label: 'Add Knowledge', description: 'Upload a CSV, paste a transcript, or add a Q&A pair to get started' },
  { id: 'connect_ai', label: 'Connect AI', description: 'Add your API key' },
  { id: 'preview', label: 'Preview', description: 'Test your chatbot' },
];

// Provider configuration for step 3
const PROVIDERS = [
  {
    id: 'anthropic' as const,
    name: 'Claude',
    company: 'Anthropic',
    tagline: 'Best conversational quality',
    defaultModel: 'claude-sonnet-4-20250514',
    helpUrl: 'https://console.anthropic.com/account/keys',
    placeholder: 'sk-ant-...',
    available: true,
  },
  {
    id: 'openai' as const,
    name: 'ChatGPT',
    company: 'OpenAI',
    tagline: 'Most popular',
    defaultModel: 'gpt-4o',
    helpUrl: 'https://platform.openai.com/api-keys',
    placeholder: 'sk-...',
    available: true,
  },
  {
    id: 'google' as const,
    name: 'Gemini',
    company: 'Google',
    tagline: "Google's AI",
    defaultModel: '',
    helpUrl: 'https://aistudio.google.com/apikey',
    placeholder: '',
    available: false, // Coming soon
  },
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
  const [knowledgeMode, setKnowledgeMode] = useState<'csv' | 'transcript' | 'manual' | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [transcript, setTranscript] = useState('');
  const [qaAdded, setQaAdded] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 3: Connect AI
  const [selectedProvider, setSelectedProvider] = useState<'anthropic' | 'openai' | 'google' | null>(null);
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

  // Step 2: Add Q&A (manual)
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

  // Step 2: CSV Upload
  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaving(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/qa-pairs/import', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success && data.pairs && data.pairs.length > 0) {
        // Bulk save the imported pairs
        const saveRes = await fetch('/api/qa-pairs/bulk-save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pairs: data.pairs }),
        });
        const saveData = await saveRes.json();
        if (saveData.success) {
          setQaAdded(true);
        }
      }
    } catch {
      // Ignore
    }
    setSaving(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Step 2: Transcript extraction
  const handleTranscriptExtract = async () => {
    if (!transcript.trim()) return;
    setExtracting(true);

    try {
      const res = await fetch('/api/qa-pairs/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript }),
      });
      const data = await res.json();
      if (data.success && data.pairs && data.pairs.length > 0) {
        // Bulk save extracted pairs
        const saveRes = await fetch('/api/qa-pairs/bulk-save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pairs: data.pairs }),
        });
        const saveData = await saveRes.json();
        if (saveData.success) {
          setQaAdded(true);
          setTranscript('');
        }
      }
    } catch {
      // Ignore
    }
    setExtracting(false);
  };

  // Step 3: Select provider card
  const handleProviderSelect = (providerId: 'anthropic' | 'openai' | 'google') => {
    const providerConfig = PROVIDERS.find((p) => p.id === providerId);
    if (!providerConfig?.available) return;

    setSelectedProvider(providerId);
    if (providerId === 'anthropic' || providerId === 'openai') {
      setProvider(providerId);
      setModel(providerConfig.defaultModel);
    }
    setApiKey('');
    setKeyError(null);
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
        {/* Branded Header */}
        <div className="flex-shrink-0 bg-[#213D66]">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-white">Set Up Your Chatbot</h1>
              <p className="text-sm text-white/70">
                Step {currentStep + 1} of {STEPS.length}: {STEPS[currentStep].label}
              </p>
            </div>
            <button
              onClick={onComplete}
              className="p-2 text-white/60 hover:text-white transition-colors"
              title="Skip setup"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Progress bar */}
          <div className="max-w-4xl mx-auto px-4 pb-6">
            <div className="flex items-center gap-2">
              {STEPS.map((step, idx) => (
                <div key={step.id} className="flex items-center flex-1">
                  <div
                    className={`flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0 transition-colors ${
                      idx < currentStep || isStepCompleted(step.id)
                        ? 'bg-green-500 text-white'
                        : idx === currentStep
                        ? 'bg-white text-[#213D66]'
                        : 'bg-transparent border-2 border-white/50 text-white/70'
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
                        idx < currentStep ? 'bg-green-500' : 'bg-white/30'
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
                      idx === currentStep ? 'text-white font-medium' : 'text-white/60'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Content - vertically centered */}
        <div className="flex-1 flex items-center justify-center p-4 min-h-0">
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
                    Upload a CSV, paste a transcript, or add a Q&A pair to get started
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
                ) : knowledgeMode === null ? (
                  <div className="space-y-3">
                    {/* CSV Upload - Primary/Largest */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv"
                      onChange={handleCSVUpload}
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={saving}
                      className="w-full p-6 border-2 border-dashed border-ce-navy/30 rounded-xl hover:border-ce-navy hover:bg-ce-navy/5 transition-colors group"
                    >
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-14 h-14 rounded-full bg-ce-navy/10 flex items-center justify-center group-hover:bg-ce-navy/20 transition-colors">
                          <Upload className="w-7 h-7 text-ce-navy" />
                        </div>
                        <div>
                          <p className="text-lg font-semibold text-gray-900">Upload CSV File</p>
                          <p className="text-sm text-gray-500 mt-1">
                            Import Q&A pairs from a spreadsheet (question, answer columns)
                          </p>
                        </div>
                        {saving && <Loader2 className="w-5 h-5 animate-spin text-ce-navy" />}
                      </div>
                    </button>

                    {/* Secondary Options */}
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setKnowledgeMode('transcript')}
                        className="p-4 border border-gray-200 rounded-lg hover:border-ce-navy hover:bg-gray-50 transition-colors text-left"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                            <FileText className="w-5 h-5 text-gray-600" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">Paste Transcript</p>
                            <p className="text-xs text-gray-500 mt-0.5">Extract Q&A from text</p>
                          </div>
                        </div>
                      </button>
                      <button
                        onClick={() => setKnowledgeMode('manual')}
                        className="p-4 border border-gray-200 rounded-lg hover:border-ce-navy hover:bg-gray-50 transition-colors text-left"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                            <MessageSquarePlus className="w-5 h-5 text-gray-600" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">Add Manually</p>
                            <p className="text-xs text-gray-500 mt-0.5">Type a Q&A pair</p>
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>
                ) : knowledgeMode === 'transcript' ? (
                  <div className="space-y-4">
                    <button
                      onClick={() => setKnowledgeMode(null)}
                      className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Back to options
                    </button>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Paste your transcript
                      </label>
                      <textarea
                        value={transcript}
                        onChange={(e) => setTranscript(e.target.value)}
                        rows={8}
                        placeholder="Paste a conversation transcript, FAQ document, or any text with questions and answers..."
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-ce-navy focus:border-transparent resize-none"
                      />
                    </div>
                    <button
                      onClick={handleTranscriptExtract}
                      disabled={!transcript.trim() || extracting}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-ce-navy text-white rounded-lg hover:bg-ce-navy/90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {extracting && <Loader2 className="w-4 h-4 animate-spin" />}
                      Extract Q&A Pairs
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <button
                      onClick={() => setKnowledgeMode(null)}
                      className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Back to options
                    </button>
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
                    Choose your AI provider to power your chatbot
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
                    {/* Provider Cards */}
                    <div className="grid grid-cols-3 gap-3">
                      {PROVIDERS.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => handleProviderSelect(p.id)}
                          disabled={!p.available}
                          className={`relative p-4 rounded-xl border-2 transition-all text-left ${
                            selectedProvider === p.id
                              ? 'border-ce-navy bg-ce-navy/5 ring-2 ring-ce-navy/20'
                              : p.available
                              ? 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                              : 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed'
                          }`}
                        >
                          {/* Selected check */}
                          {selectedProvider === p.id && (
                            <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-ce-navy flex items-center justify-center">
                              <Check className="w-3 h-3 text-white" />
                            </div>
                          )}

                          {/* Coming soon badge */}
                          {!p.available && (
                            <div className="absolute top-2 right-2 px-2 py-0.5 bg-gray-200 text-gray-600 text-xs rounded-full">
                              Soon
                            </div>
                          )}

                          {/* Provider icon/logo area */}
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-2 ${
                            p.id === 'anthropic' ? 'bg-orange-100' :
                            p.id === 'openai' ? 'bg-green-100' :
                            'bg-blue-100'
                          }`}>
                            <span className={`text-lg font-bold ${
                              p.id === 'anthropic' ? 'text-orange-600' :
                              p.id === 'openai' ? 'text-green-600' :
                              'text-blue-600'
                            }`}>
                              {p.name.charAt(0)}
                            </span>
                          </div>

                          <p className="font-semibold text-gray-900">{p.name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{p.tagline}</p>
                        </button>
                      ))}
                    </div>

                    {/* Expanded input section when provider selected */}
                    {selectedProvider && selectedProvider !== 'google' && (
                      <div className="border border-gray-200 rounded-lg p-4 space-y-4 bg-gray-50">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Model
                          </label>
                          <select
                            value={model}
                            onChange={(e) => setModel(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-ce-navy focus:border-transparent bg-white"
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
                            placeholder={PROVIDERS.find((p) => p.id === selectedProvider)?.placeholder}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-ce-navy focus:border-transparent font-mono bg-white"
                          />
                        </div>
                        {keyError && (
                          <p className="text-sm text-red-600">{keyError}</p>
                        )}
                        <div className="flex items-center justify-between gap-3">
                          <a
                            href={PROVIDERS.find((p) => p.id === selectedProvider)?.helpUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-ce-navy hover:underline flex items-center gap-1"
                          >
                            How to get your {PROVIDERS.find((p) => p.id === selectedProvider)?.name} API key
                            <ExternalLink className="w-3 h-3" />
                          </a>
                          <button
                            onClick={handleTestKey}
                            disabled={!apiKey.trim() || testing}
                            className="flex items-center justify-center gap-2 px-4 py-2 bg-ce-navy text-white rounded-lg hover:bg-ce-navy/90 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {testing && <Loader2 className="w-4 h-4 animate-spin" />}
                            Test Key
                          </button>
                        </div>
                      </div>
                    )}
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
