import React from 'react';

const icons = {
  check: (
    <path d="M5 13l4 4L19 7" />
  ),
  x: (
    <path d="M6 6l12 12M18 6l-12 12" />
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10v6" />
      <line x1="12" y1="7" x2="12" y2="7" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3l9 16H3l9-16z" />
      <path d="M12 9v4" />
      <line x1="12" y1="15" x2="12" y2="15" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V6" />
      <path d="M8 10l4-4 4 4" />
      <path d="M4 18h16" />
    </>
  ),
  download: (
    <>
      <path d="M12 6v10" />
      <path d="M8 12l4 4 4-4" />
      <path d="M4 18h16" />
    </>
  ),
  clipboard: (
    <>
      <rect x="8" y="4" width="8" height="4" rx="1" />
      <path d="M6 7h12v13H6z" />
    </>
  ),
  send: (
    <path d="M4 12l16-8-6 8 6 8-16-8z" />
  ),
  lock: (
    <>
      <rect x="6" y="11" width="12" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  unlock: (
    <>
      <rect x="6" y="11" width="12" height="9" rx="2" />
      <path d="M9 11V8a3 3 0 0 1 6 0" />
    </>
  ),
  plane: (
    <path d="M2 16l20-8-20-8 6 8-6 8z" />
  ),
  map: (
    <>
      <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" />
      <path d="M9 4v14" />
      <path d="M15 6v14" />
    </>
  ),
  doc: (
    <>
      <path d="M7 3h7l5 5v13H7z" />
      <path d="M14 3v5h5" />
    </>
  ),
  camera: (
    <>
      <path d="M4 7h4l2-2h4l2 2h4v12H4z" />
      <circle cx="12" cy="13" r="3" />
    </>
  ),
  edit: (
    <path d="M4 20l4-1 9-9-3-3-9 9-1 4zM14 7l3 3" />
  ),
  trash: (
    <>
      <path d="M5 7h14" />
      <path d="M9 7v10" />
      <path d="M15 7v10" />
      <path d="M7 7l1-3h8l1 3" />
      <rect x="6" y="7" width="12" height="13" rx="2" />
    </>
  ),
  plus: (
    <path d="M12 5v14M5 12h14" />
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  location: (
    <>
      <path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  money: (
    <>
      <rect x="4" y="7" width="16" height="10" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M4 10h2M18 14h2" />
    </>
  ),
  thumbsUp: (
    <path d="M7 11v8h3l4-8V6a2 2 0 0 0-2-2l-3 7H7zM7 11H4v8h3" />
  ),
  dot: (
    <circle cx="12" cy="12" r="3" />
  )
};

function Icon({ name, size = 16, className = '', title }) {
  const iconPath = icons[name];
  if (!iconPath) return null;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      {iconPath}
    </svg>
  );
}

export default Icon;
