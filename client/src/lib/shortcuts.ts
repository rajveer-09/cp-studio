export interface ShortcutGroup {
  group: string;
  items: { keys: string[]; label: string }[];
}

export const SHORTCUTS: ShortcutGroup[] = [
  {
    group: 'Run',
    items: [
      { keys: ['Mod', 'Enter'], label: 'Run the selected test case' },
      { keys: ['Mod', 'Shift', 'Enter'], label: 'Run all test cases' },
      { keys: ['Alt', 'N'], label: 'Add a test case' },
    ],
  },
  {
    group: 'Editor',
    items: [
      { keys: ['Shift', 'Alt', 'F'], label: 'Format code' },
      { keys: ['Mod', 'Space'], label: 'Show suggestions' },
      { keys: ['Alt', '1'], label: 'Switch to C++' },
      { keys: ['Alt', '2'], label: 'Switch to Java' },
      { keys: ['Alt', '3'], label: 'Switch to Python' },
      { keys: ['Mod', 'S'], label: 'Save (code also autosaves)' },
      { keys: ['Mod', '/'], label: 'Toggle line comment' },
      { keys: ['Mod', 'Z'], label: 'Undo (also undoes AI fixes and resets)' },
    ],
  },
  {
    group: 'Debugger',
    items: [
      { keys: ['Alt', 'W'], label: 'Debug the variable at the cursor' },
      { keys: ['F8'], label: 'Start / restart debugging' },
      { keys: ['Alt', '.'], label: 'Next step' },
      { keys: ['Alt', ','], label: 'Previous step' },
    ],
  },
  {
    group: 'AI assistant',
    items: [
      { keys: ['Mod', 'Shift', 'A'], label: 'Focus the assistant' },
      { keys: ['/'], label: 'Show commands (in the assistant input)' },
      { keys: ['Alt', 'Y'], label: 'Accept the proposed fix' },
      { keys: ['Esc'], label: 'Reject the proposed fix' },
    ],
  },
  {
    group: 'General',
    items: [
      { keys: ['Alt', 'T'], label: 'Toggle dark / light mode' },
      { keys: ['Alt', 'L'], label: 'Move test panel right / bottom' },
      { keys: ['Alt', 'B'], label: 'Show / hide the assistant panel' },
      { keys: ['Alt', '/'], label: 'Show keyboard shortcuts' },
    ],
  },
];
