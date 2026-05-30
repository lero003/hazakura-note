export function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 2.5V11.5M2.5 7H11.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  );
}

export function LinkIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5.85 8.15C6.65 8.95 7.95 8.95 8.75 8.15L10.65 6.25C11.45 5.45 11.45 4.15 10.65 3.35C9.85 2.55 8.55 2.55 7.75 3.35L7.25 3.85" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M8.15 5.85C7.35 5.05 6.05 5.05 5.25 5.85L3.35 7.75C2.55 8.55 2.55 9.85 3.35 10.65C4.15 11.45 5.45 11.45 6.25 10.65L6.75 10.15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}

export function FolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M1.5 3C1.5 2.17157 2.17157 1.5 3 1.5H6.25C6.58152 1.5 6.89946 1.6317 7.13388 1.86612L8.63388 3.36612C8.8683 3.60054 9.18624 3.73223 9.51777 3.73223H13C13.8284 3.73223 14.5 4.4038 14.5 5.23223V13C14.5 13.8284 13.8284 14.5 13 14.5H3C2.17157 14.5 1.5 13.8284 1.5 13V3Z" fill="var(--accent)" opacity="0.85"/>
    </svg>
  );
}

export function FolderOpenIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M1.5 4.75C1.5 3.92157 2.17157 3.25 3 3.25H13C13.8284 3.25 14.5 3.92157 14.5 4.75V13C14.5 13.8284 13.8284 14.5 13 14.5H3C2.17157 14.5 1.5 13.8284 1.5 13V4.75Z" fill="var(--accent)" opacity="0.85"/>
      <path d="M1.5 5.5L2.83333 2.16667C2.96667 1.83333 3.29167 1.5 3.65 1.5H6.25C6.58152 1.5 6.89946 1.6317 7.13388 1.86612L8.63388 3.36612C8.8683 3.60054 9.18624 3.73223 9.51777 3.73223H12" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

export function MarkdownFileIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 1.5C2.17157 1.5 1.5 2.17157 1.5 3V13C1.5 13.8284 2.17157 14.5 3 14.5H13C13.8284 14.5 14.5 13.8284 14.5 13V3C14.5 2.17157 13.8284 1.5 13 1.5H3Z" stroke="var(--text-muted)" strokeWidth="1.5"/>
      <path d="M4.5 5V11M4.5 5L7 8.5L9.5 5V11M11.5 6.5V9.5M10.5 8H12.5" stroke="var(--text-muted)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function TextFileIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 1.5C2.17157 1.5 1.5 2.17157 1.5 3V13C1.5 13.8284 2.17157 14.5 3 14.5H13C13.8284 14.5 14.5 13.8284 14.5 13V5.5L10.5 1.5H3Z" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M10.5 1.5V5.5H14.5" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M4 8H12M4 11H9" stroke="var(--text-muted)" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

export function ImageFileIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2.5 3C2.5 2.17157 3.17157 1.5 4 1.5H12C12.8284 1.5 13.5 2.17157 13.5 3V13C13.5 13.8284 12.8284 14.5 12 14.5H4C3.17157 14.5 2.5 13.8284 2.5 13V3Z" stroke="var(--text-muted)" strokeWidth="1.4"/>
      <path d="M4.25 11.25L6.25 8.75L8.25 10.75L9.75 8.75L12 11.25" stroke="var(--text-muted)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="10.5" cy="5.25" r="1" fill="var(--text-muted)" opacity="0.75"/>
    </svg>
  );
}

export function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="8"
      height="8"
      viewBox="0 0 8 8"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
        transition: 'transform 0.15s ease',
        opacity: 0.6
      }}
    >
      <path d="M2.5 1.5L5 4L2.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
