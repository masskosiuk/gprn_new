export const FREE_MEDIA_FILE_LIMIT = 40;

export function isProfileImageTitle(title: string | undefined): boolean {
  return title === "__profile_avatar__" || title === "__profile_cover__";
}
