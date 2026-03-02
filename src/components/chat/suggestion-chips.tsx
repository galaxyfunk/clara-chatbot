'use client';

interface SuggestionChipsProps {
  chips: string[];
  onChipClick: (chip: string) => void;
  primaryColor: string;
  isDarkBg: boolean;
}

export function SuggestionChips({
  chips,
  onChipClick,
  primaryColor,
  isDarkBg,
}: SuggestionChipsProps) {
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip, index) => (
        <button
          key={index}
          onClick={() => onChipClick(chip)}
          className="px-3 py-1.5 text-sm font-medium rounded-full transition-colors"
          style={{
            backgroundColor: isDarkBg ? 'rgba(255,255,255,0.06)' : 'white',
            border: `1px solid ${isDarkBg ? 'rgba(255,255,255,0.15)' : primaryColor}`,
            color: isDarkBg ? '#d1d5db' : primaryColor,
          }}
        >
          {chip}
        </button>
      ))}
    </div>
  );
}
