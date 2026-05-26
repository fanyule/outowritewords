import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";

export default function SettingsActionResult(props: {
  message: string;
}) {
  if (!props.message) {
    return null;
  }
  return (
    <div
      className={`app-state-panel-muted px-3 py-2 text-sm text-muted-foreground sm:px-4 sm:py-3 ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}
    >
      {props.message}
    </div>
  );
}
