import { useState } from 'react';
import {
  ActionIcon,
  Divider,
  Input,
  Popover,
  SimpleGrid,
  Stack,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { DEFAULT_ICON, extractEmoji } from '../utils/helpers';

const EMOJI_OPTIONS = [
  '📋', '📈', '📉', '📊', '💰', '🔥', '⚡', '🎯',
  '💎', '🚀', '⭐', '🌟', '💡', '🏆', '🔑', '🛡️',
  '🌊', '🦁', '🐂', '🐻', '🎲', '🔮', '💫', '🌙',
  '☀️', '🏅', '💪', '🧠', '👁️', '🎭',
];

interface EmojiPickerProps {
  value: string;
  onChange: (emoji: string) => void;
}

export function EmojiPicker({ value, onChange }: EmojiPickerProps) {
  const [opened, { open, close }] = useDisclosure(false);
  const [customInput, setCustomInput] = useState('');

  function handleSelect(emoji: string) {
    onChange(emoji);
    close();
  }

  function handleCustomChange(val: string) {
    setCustomInput(val);
    const emoji = extractEmoji(val);
    if (emoji) {
      onChange(emoji);
      setCustomInput('');
      close();
    }
  }

  return (
    <Input.Wrapper label="Icon">
      <Popover opened={opened} onClose={close} withinPortal position="bottom-start">
        <Popover.Target>
          <UnstyledButton
            onClick={opened ? close : open}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
              width: 42,
              height: 36,
              border: '1px solid var(--mantine-color-default-border)',
              borderRadius: 'var(--mantine-radius-sm)',
              background: 'var(--mantine-color-default)',
              cursor: 'pointer',
            }}
          >
            {value}
          </UnstyledButton>
        </Popover.Target>
        <Popover.Dropdown p="xs">
          <Stack gap="xs">
            <SimpleGrid cols={8} spacing={2}>
              {EMOJI_OPTIONS.map((emoji) => (
                <ActionIcon
                  key={emoji}
                  variant={value === emoji ? 'filled' : 'subtle'}
                  color="gray"
                  size="lg"
                  onClick={() => handleSelect(emoji)}
                  style={{ fontSize: 18 }}
                >
                  {emoji}
                </ActionIcon>
              ))}
            </SimpleGrid>
            <Divider />
            <TextInput
              placeholder="or paste your own emoji"
              value={customInput}
              onChange={(e) => handleCustomChange(e.currentTarget.value)}
              onFocus={() => setCustomInput('')}
              size="xs"
            />
            <UnstyledButton
              onClick={() => handleSelect(DEFAULT_ICON)}
              style={{ fontSize: 12, color: 'var(--mantine-color-dimmed)', textAlign: 'center' }}
            >
              Reset to default
            </UnstyledButton>
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </Input.Wrapper>
  );
}
