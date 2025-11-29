const StreamParser = require('./src/components/AIAssistant/utils/StreamParser.js');
const parser = new StreamParser();

const logContent = `<thinking>
Analysis: The user wants the page.tsx enhanced. I'll fix the CSS typos, improve layout and styling, and add a simple hero card with a subtitle and buttons, all within the same file.
Plan: 1) Create/update TODO.md to outline enhancements. 2) Overwrite app/page.tsx with an improved version: fix CSS properties, add a hero card, responsive typography, subtle entrance animation, and CTA buttons to docs.
</thinking>
<tool name="create_file" path="/Users/vegarberentsen/my-next-app/TODO.md">
# Enhancements for app/page.tsx

- Fix incorrect CSS properties in Container (justify-content, align-items).
- Improve layout: center content with a hero card and gradient background.
- Add responsive typography and subtle entrance animation for the title.
- Include subtitle and actionable buttons linking to Next.js and styled-components docs.
- Ensure accessibility (focus-visible styles) and mobile-friendly height (100svh).
</tool>
<tool name="create_file" path="/Users/vegarberentsen/my-next-app/app/page.tsx">
"use client"

import styled, { keyframes } from 'styled-components';

const fadeUp = keyframes\`
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
\`;

const Container = styled.div\`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100svh;
  padding: 2rem;
  background: linear-gradient(135deg, #f0f4ff 0%, #fef9f9 100%);
\`;

export default function Home() {
  return (
    <Container>
      <h1>Welcome</h1>
    </Container>
  );
}
</tool>
Done. I fixed the styling typos.`;

console.log("--- START PARSE ---");
const result = parser.parse(logContent);
console.log(result);
console.log("--- END PARSE ---");
