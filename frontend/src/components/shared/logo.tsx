export function Logo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="128"
      height="128"
      viewBox="0 0 128 128"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="10" y="10" width="108" height="108" rx="24" fill="#0F172A" />
      <path d="M38 34H52V80H78V94H38V34Z" fill="#2563EB" />
      <path d="M82 34H96V94H82V70H64V94H50V56H64V58H82V34Z" fill="#FFFFFF" />
      <rect x="95" y="42" width="5" height="15" rx="2.5" fill="#FFFFFF" />
      <rect x="103" y="35" width="5" height="22" rx="2.5" fill="#FFFFFF" />
      <rect x="111" y="28" width="5" height="29" rx="2.5" fill="#FFFFFF" />
    </svg>
  )
}
