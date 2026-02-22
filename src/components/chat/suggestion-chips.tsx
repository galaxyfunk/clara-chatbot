'use client';

interface SuggestionChipsProps {
  chips: string[];
  onChipClick: (chip: string) => void;
  primaryColor: string;
}

export function SuggestionChips({
  chips,
  onChipClick,
  primaryColor,
}: SuggestionChipsProps) {
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip, index) => (
        <button
          key={index}
          onClick={() => onChipClick(chip)}
          className="px-3 py-1.5 text-sm font-medium rounded-full bg-white hover:bg-gray-50 transition-colors"
          style={{ border: `1px solid ${primaryColor}`, color: primaryColor }}
        >
          {chip}
        </button>
      ))}
    </div>
  );
}
