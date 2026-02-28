import type { Provider, LocalModel } from "@lyrilearn/shared";
import type { ProviderStatus } from "@/lib/api";
import type { ViewMode } from "@/hooks/useSongView";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Toggle } from "@/components/ui/toggle";
import { isNonLatinScript } from "@/lib/transliterate";

interface LyricsToolbarProps {
  sourceLang: string;
  targetLang: string;
  provider: Provider;
  localModel: LocalModel;
  viewMode: ViewMode;
  config: ProviderStatus | null;
  onSourceLangChange: (lang: string) => void;
  onTargetLangChange: (lang: string) => void;
  onProviderChange: (provider: Provider, localModel?: LocalModel) => void;
  onViewModeChange: (mode: ViewMode) => void;
  hasSyncedLyrics: boolean;
  showTransliteration: boolean;
  onTransliterationChange: (show: boolean) => void;
}

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "ru", label: "Russian" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "zh", label: "Chinese" },
  { value: "ar", label: "Arabic" },
  { value: "pt", label: "Portuguese" },
  { value: "it", label: "Italian" },
  { value: "hy", label: "Armenian" },
];

export function LyricsToolbar({
  sourceLang,
  targetLang,
  provider,
  localModel,
  viewMode,
  config,
  onSourceLangChange,
  onTargetLangChange,
  onProviderChange,
  onViewModeChange,
  hasSyncedLyrics,
  showTransliteration,
  onTransliterationChange,
}: LyricsToolbarProps) {
  const providerValue =
    provider === "cloud" ? "cloud" : `local-${localModel}`;

  const handleProviderToggle = (value: string) => {
    if (!value) return;
    if (value === "cloud") {
      onProviderChange("cloud");
    } else if (value === "local-translategemma-12b-4bit") {
      onProviderChange("local", "translategemma-12b-4bit");
    } else if (value === "local-translategemma-4b-4bit") {
      onProviderChange("local", "translategemma-4b-4bit");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-4 py-3 border-b">
      {/* Language selectors */}
      <div className="flex items-center gap-2">
        <Select value={sourceLang} onValueChange={onSourceLangChange}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGES.map((l) => (
              <SelectItem key={l.value} value={l.value}>
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground">{"\u2192"}</span>
        <Select value={targetLang} onValueChange={onTargetLangChange}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Target" />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGES.map((l) => (
              <SelectItem key={l.value} value={l.value}>
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Provider toggle */}
      <ToggleGroup
        type="single"
        value={providerValue}
        onValueChange={handleProviderToggle}
        className="border rounded-md"
      >
        <ToggleGroupItem
          value="local-translategemma-12b-4bit"
          disabled={config ? !config.models["translategemma-12b-4bit"] : false}
          className="text-xs px-3"
        >
          Local 12B
        </ToggleGroupItem>
        <ToggleGroupItem
          value="local-translategemma-4b-4bit"
          disabled={config ? !config.models["translategemma-4b-4bit"] : false}
          className="text-xs px-3"
        >
          Local 4B
        </ToggleGroupItem>
        <ToggleGroupItem
          value="cloud"
          disabled={config ? !config.cloud : false}
          className="text-xs px-3"
        >
          Google
        </ToggleGroupItem>
      </ToggleGroup>

      {/* View mode toggle */}
      <ToggleGroup
        type="single"
        value={viewMode}
        onValueChange={(v) => v && onViewModeChange(v as ViewMode)}
        className="border rounded-md ml-auto"
      >
        <ToggleGroupItem value="side-by-side" className="text-xs px-3">
          Side by Side
        </ToggleGroupItem>
        <ToggleGroupItem value="interleaved" className="text-xs px-3">
          Interleaved
        </ToggleGroupItem>
        {hasSyncedLyrics && (
          <ToggleGroupItem value="karaoke" className="text-xs px-3">
            Karaoke
          </ToggleGroupItem>
        )}
      </ToggleGroup>

      {isNonLatinScript(sourceLang) && (
        <Toggle
          pressed={showTransliteration}
          onPressedChange={onTransliterationChange}
          className="text-xs px-3 border"
          aria-label="Toggle transliteration"
        >
          Aa
        </Toggle>
      )}
    </div>
  );
}
