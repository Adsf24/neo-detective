// Thin line icons for the interface chrome. 1.5px strokes, currentColor.
type Name = "mail" | "doc" | "table" | "photo" | "finding" | "world" | "board" | "inbox" | "sound" | "mute" | "phone" | "message" | "mic" | "clip";

const PATHS: Record<Name, string> = {
  mail: "M3 6.5h18v11H3z M3.5 7l8.5 6.5L20.5 7",
  doc: "M6 3h8l4 4v14H6z M14 3v4h4 M9 12h6 M9 15.5h6",
  table: "M3.5 5h17v14h-17z M3.5 10h17 M3.5 14.5h17 M9.5 5v14",
  photo: "M3.5 6.5h17v12h-17z M7.5 15l3.5-4 3 3 2-2 3 3 M15.5 9.5h.01",
  finding: "M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14z M16 16l5 5",
  world: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z M3 12h18 M12 3c3 3 3 15 0 18 M12 3c-3 3-3 15 0 18",
  board: "M4 4h16v16H4z M8 9l4 3 4-4 M8 15l4-3",
  inbox: "M3.5 13.5 6 5h12l2.5 8.5v5h-17z M3.5 13.5h5l1 2h5l1-2h5",
  sound: "M4 9.5h3.5L12 5.5v13l-4.5-4H4z M15.5 9a4 4 0 0 1 0 6 M18 6.5a7.5 7.5 0 0 1 0 11",
  mute: "M4 9.5h3.5L12 5.5v13l-4.5-4H4z M16 9.5l5 5 M21 9.5l-5 5",
  phone: "M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5.5a2 2 0 0 1 2-2z",
  message: "M4 5h16v11H9l-5 4z",
  mic: "M12 3.5a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0v-5a3 3 0 0 0-3-3z M5.5 11.5a6.5 6.5 0 0 0 13 0 M12 18v3",
  clip: "M16.5 7.5 9 15a2 2 0 0 0 3 3l8-8a4 4 0 0 0-6-6l-8.5 8.5a6 6 0 0 0 8.5 8.5L19 16",
};

export function Icon({ name, size = 20 }: { name: Name; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
