'use client';

interface SettingsTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const TABS = [
  { id: 'content', label: 'Content' },
  { id: 'style', label: 'Style' },
  { id: 'ai', label: 'AI' },
  { id: 'api-keys', label: 'API Keys' },
  { id: 'embed', label: 'Embed' },
];

export function SettingsTabs({ activeTab, onTabChange }: SettingsTabsProps) {
  return (
    <div className="flex flex-wrap gap-2 border-b border-ce-border pb-4">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${
            activeTab === tab.id
              ? 'bg-ce-navy text-white'
              : 'bg-white text-ce-text border border-ce-border hover:bg-ce-muted'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
