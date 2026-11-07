export function Icon({ name }: { name: 'chat' | 'checklist' | 'appeal' | 'upload' | 'play' | 'close' }) {
  const paths = {
    chat: 'M4 4h16v12H9l-5 4V4Zm4 4h8M8 12h5',
    checklist: 'M9 6h11M9 12h11M9 18h11M3 6l1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2',
    appeal: 'M12 3 2 8l10 5 10-5-10-5ZM5 10v6l7 5 7-5v-6',
    upload: 'M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5',
    play: 'm8 4 12 8-12 8V4Z',
    close: 'm6 6 12 12M6 18 18 6',
  };
  return (
    <svg
      className="icon"
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}
