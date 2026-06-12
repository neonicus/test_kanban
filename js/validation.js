export function validateUsername(value) {
  return Boolean(value && value.trim().length <= 30);
}

export function validateRoomName(value) {
  return Boolean(value && value.trim().length <= 50);
}

export function validateTaskTitle(value) {
  return Boolean(value && value.trim().length <= 100);
}

export function validateStatusName(value) {
  return Boolean(value && value.trim().length <= 30);
}
