import { notifications } from '@mantine/notifications';

export function notifyError(message: string) {
  notifications.show({
    color: 'red',
    title: 'Error',
    message,
  });
}
