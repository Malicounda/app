// Type declarations for asset files

declare module '*.svg?react' {
  import { FC, SVGProps } from 'react';
  const ReactComponent: FC<SVGProps<SVGSVGElement>>;
  export default ReactComponent;
}

// Media files
type ImageModule = {
  default: string;
  [key: string]: unknown;
};

declare module '*.png' {
  const content: ImageModule;
  export default content;
}

declare module '*.jpg' {
  const content: ImageModule;
  export default content;
}

declare module '*.jpeg' {
  const content: ImageModule;
  export default content;
}

declare module '*.gif' {
  const content: ImageModule;
  export default content;
}

declare module '*.webp' {
  const content: ImageModule;
  export default content;
}

// Font files
type FontModule = {
  default: string;
  [key: string]: unknown;
};

declare module '*.woff' {
  const content: FontModule;
  export default content;
}

declare module '*.woff2' {
  const content: FontModule;
  export default content;
}

declare module '*.ttf' {
  const content: FontModule;
  export default content;
}

declare module '*.eot' {
  const content: FontModule;
  export default content;
}

// JSON files
declare module '*.json' {
  const content: unknown;
  export default content;
}
