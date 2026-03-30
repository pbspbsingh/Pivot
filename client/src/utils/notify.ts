import { notifications } from '@mantine/notifications';

export function notifyError(message: string) {
  notifications.show({
    color: 'red',
    title: 'Error',
    message,
  });
}

export function notifySuccess(message: string) {
  notifications.show({
    color: 'green',
    title: 'Success',
    message,
  });
}
