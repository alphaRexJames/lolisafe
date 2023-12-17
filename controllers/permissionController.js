const self = {}

self.permissions = Object.freeze({
  user: 0, // Upload & delete own files, create & delete albums
  vip: 5, // If used with "retentionPeriods" in config, may have additional retention period options
  vvip: 10, // If used with "retentionPeriods" in config, may have additional retention period options
  moderator: 50, // Delete other user's files
  admin: 80, // Manage users (disable accounts) & create moderators
  superadmin: 100 // Create admins
  // Groups will inherit permissions from groups which have lower value
  // You should NOT have multiple groups with exact same values
})

self.keys = Object.freeze(Object.keys(self.permissions))

self.group = user => {
  for (const key of self.keys) {
    if (user.permission === self.permissions[key]) {
      return key
    }
  }
  return null
}

// returns true if user is in the group OR higher
self.is = (user, group) => {
  if (typeof group !== 'string' || !group) {
    return false
  }
  const permission = user.permission || 0
  return permission >= self.permissions[group]
}

self.higher = (user, target) => {
  const userPermission = user.permission || 0
  const targetPermission = target.permission || 0
  return userPermission > targetPermission
}

self.mapPermissions = user => {
  const map = {}
  Object.keys(self.permissions).forEach(group => {
    map[group] = self.is(user, group)
  })
  return map
}

module.exports = self
