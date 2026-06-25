export function PoweredByBadge() {
  return (
    <div className="flex items-center justify-center gap-1.5 py-4 text-xs text-gray-400">
      <span>Powered by</span>
      <a
        href="https://boothgenius.com"
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-gray-500 hover:text-orange-500 transition-colors"
      >
        Booth Genius
      </a>
    </div>
  );
}
