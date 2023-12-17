/* global swal, axios, ClipboardJS, LazyLoad, bulmaCollapsible */

const lsKeys = {
  token: 'token',
  viewType: {
    uploads: 'viewTypeUploads',
    uploadsAll: 'viewTypeUploadsAll'
  },
  selected: {
    uploads: 'selectedUploads',
    uploadsAll: 'selectedUploadsAll',
    albums: 'selectedAlbums',
    albumsAll: 'selectedAlbumsAll',
    users: 'selectedUsers'
  },
  originalNames: {
    uploads: 'originalNames',
    uploadsAll: 'originalNamesAll'
  }
}

const page = {
  // #dashboard
  section: null,
  // #page
  dom: null,

  // user token
  token: localStorage[lsKeys.token],

  // from api/tokens/verify
  username: null,
  permissions: null,

  // sidebar menus
  menusContainer: null,
  menus: [],

  currentView: null,
  views: {
    // params of uploads view
    uploads: {
      type: localStorage[lsKeys.viewType.uploads],
      originalNames: localStorage[lsKeys.originalNames.uploads] === '1',
      album: null, // album's id
      pageNum: null
    },
    // params of uploads view (all)
    uploadsAll: {
      type: localStorage[lsKeys.viewType.uploadsAll],
      originalNames: localStorage[lsKeys.originalNames.uploadsAll] === '1',
      filters: null,
      pageNum: null,
      all: true
    },
    // params of albums view
    albums: {
      filters: null,
      pageNum: null
    },
    // params of albums view (all)
    albumsAll: {
      filters: null,
      pageNum: null,
      all: true
    },
    // params of users view
    users: {
      filters: null,
      pageNum: null
    }
  },
  prevPageNums: {
    uploads: null,
    uploadsAll: null,
    albums: null,
    albumsAll: null,
    users: null
  },

  // ids of selected items (shared across pages and will be synced with localStorage)
  selected: {
    uploads: [],
    uploadsAll: [],
    albums: [],
    albumsAll: [],
    users: []
  },
  checkboxes: [],
  lastSelected: [],

  // select album dom for dialogs/modals
  selectAlbumContainer: null,

  // cache for dialogs/modals
  cache: {},

  clipboardJS: null,
  lazyLoad: null,
  albumsSidebarCollapse: null,
  albumsSidebarCollapsible: null,

  imageExts: ['.gif', '.jpeg', '.jpg', '.png', '.svg', '.tif', '.tiff', '.webp'],
  videoExts: ['.3g2', '.3gp', '.asf', '.avchd', '.avi', '.divx', '.evo', '.flv', '.h264', '.h265', '.hevc', '.m2p', '.m2ts', '.m4v', '.mk3d', '.mkv', '.mov', '.mp4', '.mpeg', '.mpg', '.mxf', '.ogg', '.ogv', '.ps', '.qt', '.rmvb', '.ts', '.vob', '.webm', '.wmv'],
  audioExts: ['.flac', '.mp3', '.wav', '.wma'],

  isSomethingLoading: false,
  fadingIn: null,

  albumTitleMaxLength: 70,
  albumDescMaxLength: 4000,

  // Better Cloudflare errors
  cloudflareErrors: {
    520: 'Unknown Error',
    521: 'Web Server Is Down',
    522: 'Connection Timed Out',
    523: 'Origin Is Unreachable',
    524: 'A Timeout Occurred',
    525: 'SSL Handshake Failed',
    526: 'Invalid SSL Certificate',
    527: 'Railgun Error',
    530: 'Origin DNS Error'
  }
}

page.unhide = () => {
  document.querySelector('#loader').classList.add('is-hidden')
  page.section.classList.remove('is-hidden')
}

// Handler for regular JS errors
page.onError = error => {
  console.error(error)

  const content = document.createElement('div')
  content.innerHTML = `
    <p><code>${error.toString()}</code></p>
    <p>Please check your console for more information.</p>
  `
  return swal({
    title: 'An error occurred!',
    icon: 'error',
    content
  })
}

// Handler for Axios errors
page.onAxiosError = error => {
  if (!error.response) {
    return page.onError(error)
  }

  const statusText = page.cloudflareErrors[error.response.status] || error.response.statusText
  const description = error.response.data && error.response.data.description
    ? error.response.data.description
    : 'There was an error with the request.\nPlease check the console for more information.'

  return swal(`${error.response.status} ${statusText}`, description, 'error')
}

page.preparePage = () => {
  if (page.token) page.verifyToken(page.token)
  else window.location = 'auth'
}

page.checkClientVersion = apiVersion => {
  const self = document.querySelector('#mainScript')
  const match = self.src.match(/\?_=(\d+)$/)
  if (match && match[1] && match[1] !== apiVersion) {
    return swal({
      title: 'Update detected!',
      text: 'Client assets have been updated. Reload to display the latest version?',
      icon: 'info',
      buttons: {
        confirm: {
          text: 'Reload',
          closeModal: false
        }
      }
    }).then(() => {
      window.location.reload()
    })
  }
}

page.verifyToken = token => {
  axios.post('api/tokens/verify', { token }).then(response => {
    axios.defaults.headers.common.token = token
    localStorage[lsKeys.token] = token

    if (response.data.version) {
      page.checkClientVersion(response.data.version)
    }

    page.token = token
    page.username = response.data.username
    page.permissions = response.data.permissions
    page.prepareDashboard()
  }).catch(error => {
    return page.onAxiosError(error).then(() => {
      if (error.response.data && error.response.data.code === 10001) {
        localStorage.removeItem(lsKeys.token)
        window.location = 'auth'
      }
    })
  })
}

page.prepareDashboard = () => {
  page.section = document.querySelector('#dashboard')
  page.dom = page.section.querySelector('#page')

  // Capture all click events
  page.dom.addEventListener('click', page.domClick, true)

  // Capture all submit events
  page.dom.addEventListener('submit', event => {
    // Prevent default if necessary
    if (event.target && event.target.classList.contains('prevent-default')) {
      return event.preventDefault()
    }
  }, true)

  page.menusContainer = document.querySelector('#menu')

  // All item menus in the sidebar
  const itemMenus = [
    { selector: '#itemUploads', onclick: page.getUploads },
    { selector: '#itemDeleteUploadsByNames', onclick: page.deleteUploadsByNames },
    { selector: '#itemManageYourAlbums', onclick: page.getAlbums },
    { selector: '#itemManageToken', onclick: page.changeToken },
    { selector: '#itemChangePassword', onclick: page.changePassword },
    { selector: '#itemLogout', onclick: page.logout },
    { selector: '#itemManageUploads', onclick: page.getUploads, params: { all: true }, group: 'moderator' },
    { selector: '#itemManageAlbums', onclick: page.getAlbums, params: { all: true }, group: 'moderator' },
    { selector: '#itemStatistics', onclick: page.getStatistics, group: 'admin' },
    { selector: '#itemManageUsers', onclick: page.getUsers, group: 'admin' }
  ]

  for (let i = 0; i < itemMenus.length; i++) {
    // Skip item menu if not enough permission
    if (itemMenus[i].group && !page.permissions[itemMenus[i].group]) continue

    // Add onclick event listener
    const item = document.querySelector(itemMenus[i].selector)
    item.addEventListener('click', event => {
      if (page.isSomethingLoading) return page.warnSomethingLoading()

      // eslint-disable-next-line compat/compat
      itemMenus[i].onclick.call(null, Object.assign(itemMenus[i].params || {}, {
        trigger: event.currentTarget,
        forceScroll: true
      }))
    })

    item.classList.remove('is-hidden')
    page.menus.push(item)
  }

  // If at least a moderator, show administration section
  if (page.permissions.moderator) {
    document.querySelector('#itemLabelAdmin').classList.remove('is-hidden')
    document.querySelector('#itemListAdmin').classList.remove('is-hidden')
  }

  // Update text of logout button
  document.querySelector('#itemLogout').innerHTML = `Logout ( ${page.username} )`

  // Finally display dashboard
  page.unhide()

  // Load albums sidebar
  page.getAlbumsSidebar()

  if (typeof page.prepareShareX === 'function') page.prepareShareX()
}

page.logout = params => {
  page.updateTrigger(params.trigger, 'active')
  localStorage.removeItem(lsKeys.token)
  window.location = 'auth'
}

page.warnSomethingLoading = () => {
  swal('Please wait!', 'Something else is still loading\u2026', 'warning', {
    buttons: false,
    timer: 3000
  })
}

page.updateTrigger = (trigger, newState) => {
  if (!trigger) return

  // Disable menus container and pagination when loading
  if (newState === 'loading') {
    page.isSomethingLoading = true
    page.section.classList.add('is-loading')
  } else {
    page.section.classList.remove('is-loading')
    page.isSomethingLoading = false
  }

  if (newState === 'loading') {
    trigger.classList.add('is-loading')
  } else if (newState === 'active') {
    if (trigger.parentNode.tagName === 'LI' && !trigger.className.includes('pagination-link')) {
      for (let i = 0; i < page.menus.length; i++) {
        page.menus[i].classList.remove('is-active')
      }
      trigger.classList.add('is-active')
    }
    trigger.classList.remove('is-loading')
  } else {
    trigger.classList.remove('is-loading')
    trigger.classList.remove('is-active')
  }
}

page.getItemID = element => {
  // This expects the item's parent to have the item's ID
  let parent = element.parentNode
  // If the element is part of a set of controls, use the container's parent instead
  if (element.parentNode.classList.contains('controls')) parent = parent.parentNode
  return parseInt(parent.dataset.id)
}

page.domClick = event => {
  // We are processing clicks this way to avoid using "onclick" attribute
  // Apparently we will need to use "unsafe-inline" for "script-src" directive
  // of Content Security Policy (CSP), if we want to use "onclick" attribute
  // Though I think that only applies to some browsers (?)
  // Of course it wouldn't have mattered if we didn't use CSP to begin with
  // Anyway, I personally would rather not use "onclick" attribute
  let element = event.target
  if (!element) return

  // Delegate click events to their A or BUTTON parents
  if (['I'].includes(element.tagName) && ['SPAN'].includes(element.parentNode.tagName)) {
    element = element.parentNode
  }
  if (['SPAN'].includes(element.tagName) && ['A', 'BUTTON'].includes(element.parentNode.tagName)) {
    element = element.parentNode
  }

  // Skip elements that have no action data
  if (!element.dataset || !element.dataset.action) return

  // Skip disabled elements
  if (element.hasAttribute('disabled')) return

  event.stopPropagation() // maybe necessary
  const id = page.getItemID(element)
  const action = element.dataset.action

  switch (action) {
    // Uploads
    case 'view-list':
      return page.setUploadsView('list', element)
    case 'view-thumbs':
      return page.setUploadsView('thumbs', element)
    case 'toggle-original-names':
      return page.toggleOriginalNames(element)
    case 'add-to-album':
      return page.addToAlbum(id)
    case 'delete-upload':
      return page.deleteUpload(id)
    case 'add-selected-uploads-to-album':
      return page.addSelectedUploadsToAlbum()
    case 'bulk-delete-uploads':
      return page.bulkDeleteUploads()
    case 'display-preview':
      return page.displayPreview(id)
    case 'upload-filters-help':
      return page.uploadFiltersHelp(element)
    case 'filter-uploads':
      return page.filterUploads(element)
    case 'sort-uploads':
      return page.sortUploads(element)
    // Statistics
    case 'reload-stats-category':
      return page.reloadStatsCategory(element)
    case 'filter-uploads-with':
      return page.filterUploadsWith(element)
    case 'filter-uploads-by-type':
      return page.filterUploadsByType(element)
    // Manage your albums
    case 'submit-album':
      return page.submitAlbum(element)
    case 'edit-album':
      return page.editAlbum(id)
    case 'disable-album':
      return page.disableAlbum(id)
    case 'delete-album':
      return page.deleteAlbum(id)
    case 'view-album-uploads':
      return page.viewAlbumUploads(id, element)
    // Manage users
    case 'create-user':
      return page.createUser()
    case 'edit-user':
      return page.editUser(id)
    case 'disable-user':
      return page.disableUser(id)
    case 'delete-user':
      return page.deleteUser(id)
    case 'view-user-uploads':
      return page.viewUserUploads(id, element)
    // Manage your token
    case 'get-new-token':
      return page.getNewToken(element)
    // Shared (uploads, albums, users)
    case 'clear-selection':
      return page.clearSelection()
    case 'select':
      return page.select(element, event)
    case 'select-all':
      return page.selectAll(element)
    // Shared pagination (uploads, albums, users)
    case 'page-ellipsis':
      return page.focusJumpToPage(element)
    case 'page-prev':
    case 'page-next':
    case 'page-goto':
    case 'jump-to-page':
      return page.switchPage(action, element)
  }
}

page.fadeIn = (element = page.dom, disableFading = false) => {
  if (element._fadeInTimeout) {
    clearTimeout(element._fadeInTimeout)
    element.classList.remove('anim-fade-in')
  }

  if (!disableFading) {
    element.classList.add('anim-fade-in')
    element._fadeInTimeout = setTimeout(() => {
      element.classList.remove('anim-fade-in')
      delete element._fadeInTimeout
    }, 500)
  }
}

page.scrollTo = (element = page.dom, disableSmooth = false) => {
  element.scrollIntoView({
    behavior: disableSmooth ? 'auto' : 'smooth',
    block: 'start',
    inline: 'nearest'
  })
}

page.getByView = (view, get) => {
  switch (view) {
    case 'uploads':
    case 'uploadsAll':
      return {
        type: 'uploads',
        func: page.getUploads
      }[get]
    case 'albums':
    case 'albumsAll':
      return {
        type: 'albums',
        func: page.getAlbums
      }[get]
    case 'users':
      return {
        type: 'users',
        func: page.getUsers
      }[get]
    default:
      return null
  }
}

page.switchPage = (action, element) => {
  if (page.isSomethingLoading) return page.warnSomethingLoading()

  // eslint-disable-next-line compat/compat
  const params = Object.assign(page.views[page.currentView], {
    trigger: element
  })

  const func = page.getByView(page.currentView, 'func')

  switch (action) {
    case 'page-prev':
      params.pageNum = page.views[page.currentView].pageNum - 1
      if (params.pageNum < 0) {
        return swal('An error occurred!', 'This is already the first page.', 'error')
      }
      return func(params)
    case 'page-next':
      params.pageNum = page.views[page.currentView].pageNum + 1
      return func(params)
    case 'page-goto':
      params.pageNum = parseInt(element.dataset.goto)
      return func(params)
    case 'jump-to-page': {
      const jumpToPage = document.querySelector(`#${element.dataset.jumpid || 'jumpToPage'}`)
      if (!jumpToPage.checkValidity()) return
      const parsed = parseInt(jumpToPage.value)
      params.pageNum = isNaN(parsed) ? 0 : (parsed - 1)
      if (params.pageNum < 0) params.pageNum = 0
      return func(params)
    }
  }
}

page.focusJumpToPage = element => {
  const jumpToPage = document.querySelector(`#${element.dataset.jumpid || 'jumpToPage'}`)
  if (!jumpToPage) return
  jumpToPage.focus()
  jumpToPage.select()
}

page.getUploads = (params = {}) => {
  if (params && params.all && !page.permissions.moderator) {
    return swal('An error occurred!', 'You cannot do this!', 'error')
  }

  if (page.isSomethingLoading) return page.warnSomethingLoading()

  page.updateTrigger(params.trigger, 'loading')

  if (typeof params.pageNum !== 'number' || params.pageNum < 0) {
    params.pageNum = 0
  }

  const url = typeof params.album !== 'undefined'
    ? `api/album/${params.album}/${params.pageNum}`
    : `api/uploads/${params.pageNum}`

  const headers = {}
  if (params.all) headers.all = '1'
  if (params.filters) {
    headers.filters = params.filters
    // Send client timezone offset if properly using date: and/or :expiry filters
    // Server will assume client is on UTC if unset
    if (/(^|\s)(date|expiry):[\d"]/.test(params.filters)) {
      headers.minoffset = new Date().getTimezoneOffset()
    }
  }

  axios.get(url, { headers }).then(response => {
    if (response.data.success === false) {
      if (response.data.description === 'No token provided') {
        return page.verifyToken(page.token)
      } else {
        page.updateTrigger(params.trigger)
        return swal('An error occurred!', response.data.description, 'error')
      }
    }

    const uploadsPerPage = response.data.uploadsPerPage || 25
    const pages = Math.ceil(response.data.count / uploadsPerPage)
    const files = response.data.files
    if (params.pageNum && (files.length === 0)) {
      page.updateTrigger(params.trigger)
      if (params.autoPage) {
        params.pageNum = pages - 1
        return page.getUploads(params)
      } else {
        return swal('An error occurred!', `There are no more uploads to populate page ${params.pageNum + 1}.`, 'error')
      }
    }

    page.currentView = params.all ? 'uploadsAll' : 'uploads'
    page.cache = {}

    const albums = response.data.albums
    const users = response.data.users
    const basedomain = response.data.basedomain

    if (params.pageNum < 0) {
      params.pageNum = Math.max(0, pages + params.pageNum)
    }
    const pagination = page.paginate(response.data.count, uploadsPerPage, params.pageNum)

    const filter = `
      <div class="column">
        <form class="prevent-default">
          <div class="field has-addons">
            <div class="control is-expanded">
              <input id="filters" class="input is-small" type="text" placeholder="Filter uploads" value="${page.escape(params.filters || '')}">
            </div>
            <div class="control">
              <button type="button" class="button is-small is-primary is-outlined" title="Help?" data-action="upload-filters-help"${params.all ? ' data-all="true"' : ''}>
                <span class="icon">
                  <i class="icon-help-circled"></i>
                </span>
              </button>
            </div>
            <div class="control">
              <button type="submit" class="button is-small is-info is-outlined" title="Filter uploads" data-action="filter-uploads">
                <span class="icon">
                  <i class="icon-filter"></i>
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>
    `
    const extraControls = `
      <div class="columns">
        ${filter}
        <div class="column is-one-quarter">
          <form class="prevent-default">
            <div class="field has-addons">
              <div class="control is-expanded">
                <input id="jumpToPage" class="input is-small" type="number" min="1" max="${pages}" value="${params.pageNum + 1}"${pages === 1 ? ' disabled' : ''}>
              </div>
              <div class="control">
                <button type="submit" class="button is-small is-info is-outlined" title="Jump to page" data-action="jump-to-page">
                  <span class="icon">
                    <i class="icon-paper-plane"></i>
                  </span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    `

    const controls = `
      <div class="columns">
        <div class="column exclusive-operations has-text-left">
          <a class="button is-small is-primary is-outlined" title="Toggle original names" data-action="toggle-original-names">
            <span class="icon">
              <i class="icon-exchange"></i>
            </span>
            <span>Toggle original names</span>
          </a>
        </div>
        <div class="column has-text-centered">
          <a class="button is-small is-danger is-outlined" title="List view" data-action="view-list">
            <span class="icon">
              <i class="icon-th-list"></i>
            </span>
          </a>
          <a class="button is-small is-danger is-outlined" title="Thumbs view" data-action="view-thumbs">
            <span class="icon">
              <i class="icon-th-large"></i>
            </span>
          </a>
        </div>
        <div class="column bulk-operations has-text-right">
          <a class="button is-small is-info is-outlined" title="Clear selection" data-action="clear-selection">
            <span class="icon">
              <i class="icon-cancel"></i>
            </span>
          </a>
          ${params.all
            ? ''
            : `<a class="button is-small is-warning is-outlined" title="Bulk add to album" data-action="add-selected-uploads-to-album">
            <span class="icon">
              <i class="icon-plus"></i>
            </span>
          </a>`}
          <a class="button is-small is-danger is-outlined" title="Bulk delete" data-action="bulk-delete-uploads">
            <span class="icon">
              <i class="icon-trash"></i>
            </span>
            <span>Bulk delete</span>
          </a>
        </div>
      </div>
    `

    // Do some string replacements for bottom controls
    const bottomFiltersId = 'bFilters'
    const bottomJumpId = 'bJumpToPage'
    const bottomExtraControls = extraControls
      .replace(/id="filters"/, `id="${bottomFiltersId}"`)
      .replace(/(data-action="filter-uploads")/, `$1 data-filtersid="${bottomFiltersId}"`)
      .replace(/id="jumpToPage"/, `id="${bottomJumpId}"`)
      .replace(/(data-action="jump-to-page")/g, `$1 data-jumpid="${bottomJumpId}"`)
    const bottomPagination = pagination
      .replace(/(data-action="page-ellipsis")/g, `$1 data-jumpid="${bottomJumpId}"`)

    // Whether there are any unselected items
    let unselected = false

    const filterAllByAlbums = params.all && params.filters && params.filters.includes('albumid:')
    const hasExpiryDateColumn = files.some(file => typeof file.expirydate !== 'undefined')
    const showOriginalNames = page.views[page.currentView].originalNames

    for (let i = 0; i < files.length; i++) {
      // Build full URLs
      files[i].file = `${basedomain || window.location.origin}/${files[i].name}`
      if (files[i].thumb) {
        files[i].thumb = `${basedomain ? `${basedomain}/` : ''}${files[i].thumb}`
      }

      // Determine types
      const extname = files[i].extname.toLowerCase()
      if (page.imageExts.includes(extname)) {
        files[i].type = 'picture'
      } else if (page.videoExts.includes(extname)) {
        files[i].type = 'video'
      } else if (page.audioExts.includes(extname)) {
        files[i].type = 'audio'
      } else {
        files[i].type = 'other'
      }

      files[i].previewable = files[i].thumb || files[i].type === 'audio'

      // Cache bare minimum data for thumbnails viewer
      page.cache[files[i].id] = {
        name: files[i].name,
        original: files[i].original,
        extname: files[i].extname,
        thumb: files[i].thumb,
        file: files[i].file,
        type: files[i].type,
        previewable: files[i].previewable
      }

      // Prettify
      files[i].prettyAlbum = (albums && files[i].albumid && albums[files[i].albumid])
        ? `[${files[i].albumid}] ${albums[files[i].albumid]}` || ''
        : ''
      files[i].prettyBytes = page.getPrettyBytes(parseInt(files[i].size))
      files[i].prettyDate = page.getPrettyDate(new Date(files[i].timestamp * 1000))
      files[i].prettyUser = (users && files[i].userid && users[files[i].userid])
        ? users[files[i].userid]
        : ''

      if (hasExpiryDateColumn) {
        files[i].prettyExpiryDate = files[i].expirydate
          ? page.getPrettyDate(new Date(files[i].expirydate * 1000))
          : null
      }

      // Update selected status
      files[i].selected = page.selected[page.currentView].includes(files[i].id)
      if (!files[i].selected) {
        unselected = true
      }
    }

    if (page.views[page.currentView].type === 'thumbs') {
      page.dom.innerHTML = `
        ${pagination}
        ${extraControls}
        ${controls}
        <div id="table" class="columns is-multiline is-mobile is-centered">
        </div>
        ${controls}
        ${bottomExtraControls}
        ${bottomPagination}
      `

      const table = document.querySelector('#table')

      for (let i = 0; i < files.length; i++) {
        const upload = files[i]
        let appendix = ''
        if (params.all) {
          appendix += upload.prettyUser ? `<span>${upload.prettyUser}</span> \u2013 ` : ''
        }
        if (!params.all || filterAllByAlbums) {
          appendix += upload.prettyAlbum ? `<span>${upload.prettyAlbum}</span> \u2013 ` : ''
        }

        const div = document.createElement('div')
        div.className = 'image-container column'
        div.dataset.id = upload.id

        if (typeof upload.thumb === 'undefined') {
          div.innerHTML = `<a class="image" href="${upload.file}" target="_blank"><h1 class="title">${upload.extname || 'N/A'}</h1></a>`
        } else {
          div.innerHTML = `<a class="image" href="${upload.file}" target="_blank"><img alt="${upload.name}" data-src="${upload.thumb}"/></a>`
        }

        div.innerHTML += `
          <input type="checkbox" class="checkbox" title="Select" data-index="${i}" data-action="select"${upload.selected ? ' checked' : ''}>
          <div class="controls">
            ${upload.previewable
              ? `<a class="button is-small is-primary" title="Display preview" data-action="display-preview">
              <span class="icon">
                <i class="${upload.type !== 'other' ? `icon-${upload.type}` : 'icon-doc-inv'}"></i>
              </span>
            </a>`
              : ''}
            <a class="button is-small is-info" title="View file info" href="file/${upload.name}" target="_blank">
              <span class="icon">
                <i class="icon-info"></i>
              </span>
            </a>
            <a class="button is-small is-info clipboard-js" title="Copy link to clipboard" data-clipboard-text="${upload.file}">
              <span class="icon">
                <i class="icon-clipboard"></i>
              </span>
            </a>
            <a class="button is-small is-warning" title="Add to album" data-action="add-to-album">
              <span class="icon">
                <i class="icon-plus"></i>
              </span>
            </a>
            <a class="button is-small is-danger" title="Delete" data-action="delete-upload">
              <span class="icon">
                <i class="icon-trash"></i>
              </span>
            </a>
          </div>
          <div class="details">
            <p class="name" title="${upload.file}">${upload.name}</p>
            ${showOriginalNames ? `<p class="originalname" title="${upload.original}">${upload.original}</p>` : ''}
            <p class="prettybytes" data-bytes="${upload.size}">${appendix}${upload.prettyBytes}</p>
            ${hasExpiryDateColumn && upload.prettyExpiryDate
              ? `<p class="prettyexpirydate"${upload.expirydate ? ` data-timestamp="${upload.expirydate}"` : ''}>EXP: ${upload.prettyExpiryDate}</p>`
              : ''}
          </div>
        `

        table.appendChild(div)
        page.checkboxes = table.querySelectorAll('.checkbox[data-action="select"]')
      }
    } else {
      page.dom.innerHTML = `
        ${pagination}
        ${extraControls}
        ${controls}
        <div class="table-container has-text-left">
          <table class="table is-narrow is-fullwidth is-hoverable">
            <thead>
              <tr>
                <th class="controls"><input id="selectAll" class="checkbox" type="checkbox" title="Select all" data-action="select-all"></th>
                <th title="Key: name" data-action="sort-uploads">File name</th>
                ${showOriginalNames ? '<th title="Key: original" data-action="sort-uploads">Original name</th>' : ''}
                ${params.all ? '<th title="Key: userid" data-action="sort-uploads">User</th>' : ''}
                ${!params.all || filterAllByAlbums ? '<th title="Key: albumid" data-action="sort-uploads">Album</th>' : ''}
                <th title="Key: size" data-action="sort-uploads" data-default-sort="desc">Size</th>
                ${params.all ? '<th title="Key: ip" data-action="sort-uploads">IP</th>' : ''}
                <th title="Key: timestamp" data-action="sort-uploads">Upload date</th>
                ${hasExpiryDateColumn ? '<th title="Key: expirydate" data-action="sort-uploads">Expiry date</th>' : ''}
                <th class="has-text-right">(${response.data.count} total)</th>
              </tr>
            </thead>
            <tbody id="table">
            </tbody>
          </table>
        </div>
        ${controls}
        ${bottomExtraControls}
        ${bottomPagination}
      `

      const table = document.querySelector('#table')

      for (let i = 0; i < files.length; i++) {
        const upload = files[i]

        const tr = document.createElement('tr')
        tr.dataset.id = upload.id
        tr.innerHTML = `
          <td class="controls"><input type="checkbox" class="checkbox" title="Select" data-index="${i}" data-action="select"${upload.selected ? ' checked' : ''}></td>
          <th class="name"><a href="${upload.file}" target="_blank" title="${upload.file}">${upload.name}</a></th>
          ${showOriginalNames ? `<th class="originalname" title="${upload.original}">${upload.original}</th>` : ''}
          ${params.all ? `<th class="appendix">${upload.prettyUser}</th>` : ''}
          ${!params.all || filterAllByAlbums ? `<th class="album">${upload.prettyAlbum}</th>` : ''}
          <td class="prettybytes" data-bytes="${upload.size}">${upload.prettyBytes}</td>
          ${params.all ? `<td class="ip">${upload.ip || ''}</td>` : ''}
          <td class="prettydate" data-timestamp="${upload.timestamp}">${upload.prettyDate}</td>
          ${hasExpiryDateColumn ? `<td class="prettyexpirydate"${upload.expirydate ? ` data-timestamp="${upload.expirydate}"` : ''}>${upload.prettyExpiryDate || '-'}</td>` : ''}
          <td class="controls has-text-right">
            <a class="button is-small is-primary is-outlined" title="${upload.previewable ? 'Display preview' : 'File can\'t be previewed'}" data-action="display-preview"${upload.previewable ? '' : ' disabled'}>
              <span class="icon">
                <i class="${upload.type !== 'other' ? `icon-${upload.type}` : 'icon-doc-inv'}"></i>
              </span>
            </a>
            <a class="button is-small is-info is-outlined" title="View file info" href="file/${upload.name}" target="_blank">
              <span class="icon">
                <i class="icon-info"></i>
              </span>
            </a>
            <a class="button is-small is-info is-outlined clipboard-js" title="Copy link to clipboard" data-clipboard-text="${upload.file}">
              <span class="icon">
                <i class="icon-clipboard"></i>
              </span>
            </a>
            ${params.all
              ? ''
              : `<a class="button is-small is-warning is-outlined" title="Add to album" data-action="add-to-album">
              <span class="icon">
                <i class="icon-plus"></i>
              </span>
            </a>`}
            <a class="button is-small is-danger is-outlined" title="Delete" data-action="delete-upload">
              <span class="icon">
                <i class="icon-trash"></i>
              </span>
            </a>
          </td>
        `

        table.appendChild(tr)
        page.checkboxes = table.querySelectorAll('.checkbox[data-action="select"]')
      }
    }

    const selectAll = document.querySelector('#selectAll')
    if (files.length && selectAll && !unselected) {
      selectAll.checked = true
      selectAll.title = 'Unselect all'
    }

    page.fadeIn(page.dom)

    const pageNum = files.length ? params.pageNum : 0
    if (params.forceScroll ||
      page.prevPageNums[page.currentView] === null ||
      page.prevPageNums[page.currentView] !== pageNum) {
      const disableSmooth = !params.forceScroll && page.views[page.currentView].type === 'thumbs'
      page.scrollTo(page.dom, disableSmooth)
    }

    if (page.views[page.currentView].type === 'thumbs') {
      page.lazyLoad.update()
    }

    page.updateTrigger(params.trigger, 'active')

    if (page.currentView === 'uploads') {
      page.views.uploads.album = params.album
    }
    page.views[page.currentView].filters = params.filters
    page.views[page.currentView].pageNum = page.prevPageNums[page.currentView] = pageNum
  }).catch(error => {
    page.updateTrigger(params.trigger)
    page.onAxiosError(error)
  })
}

page.setUploadsView = (view, element) => {
  if (page.isSomethingLoading) return page.warnSomethingLoading()

  if (view === 'list') {
    delete localStorage[lsKeys.viewType[page.currentView]]
    page.views[page.currentView].type = void 0
  } else {
    localStorage[lsKeys.viewType[page.currentView]] = view
    page.views[page.currentView].type = view
  }

  // eslint-disable-next-line compat/compat
  page.getUploads(Object.assign(page.views[page.currentView], {
    trigger: element
  }))
}

page.toggleOriginalNames = element => {
  if (page.isSomethingLoading) return page.warnSomethingLoading()

  if (page.views[page.currentView].originalNames) {
    delete localStorage[lsKeys.originalNames[page.currentView]]
    page.views[page.currentView].originalNames = false
  } else {
    localStorage[lsKeys.originalNames[page.currentView]] = '1'
    page.views[page.currentView].originalNames = true
  }

  // eslint-disable-next-line compat/compat
  page.getUploads(Object.assign(page.views[page.currentView], {
    trigger: element
  }))
}

page.displayPreview = id => {
  const file = page.cache[id]
  if (!file.previewable) return

  const div = document.createElement('div')
  div.innerHTML = `
    <div class="content has-text-centered">
      <p>
        <div class="has-text-weight-bold has-word-break-all">${file.name}</div>
        <div class="has-word-break-all">${file.original}</div>
      </p>
      ${file.thumb
        ? `<p class="swal-display-thumb-container">
        <img id="swalThumb" src="${file.thumb}">
      </p>`
        : ''}
    </div>
  `

  if (file.file && ['picture', 'video', 'audio'].includes(file.type)) {
    div.innerHTML += `
      <div class="field has-text-centered">
        <div class="controls">
          <a id="swalOriginal" type="button" class="button is-info">
            <span class="icon">
              <i class="icon-${file.type}"></i>
            </span>
            <span>${file.type === 'picture' ? 'Load original' : 'Play in embedded player'}</span>
          </a>
        </div>
      </div>
    `

    if (file.type === 'picture') {
      div.querySelector('#swalOriginal').addEventListener('click', event => {
        const trigger = event.currentTarget
        if (trigger.classList.contains('is-danger')) return

        trigger.classList.add('is-loading')
        const thumb = div.querySelector('#swalThumb')

        thumb.src = file.file
        thumb.onload = () => {
          trigger.classList.add('is-hidden')
          document.body.querySelector('.swal-overlay .swal-modal:not(.is-expanded)').classList.add('is-expanded')
        }
        thumb.onerror = event => {
          event.currentTarget.classList.add('is-hidden')
          trigger.className = 'button is-danger is-fullwidth'
          trigger.innerHTML = `
            <span class="icon">
              <i class="icon-block"></i>
            </span>
            <span>Unable to load original</span>
          `
        }
      })
    } else {
      const match = file.file.match(/.*\/(.*)$/)
      if (match || match[1]) {
        div.querySelector('#swalOriginal').setAttribute('href', `v/${match[1]}`)
        div.querySelector('#swalOriginal').setAttribute('target', '_blank')
      }
    }
  }

  return swal({
    content: div,
    buttons: false
  }).then(() => {
    // Restore modal size
    document.body.querySelector('.swal-overlay .swal-modal').classList.remove('is-expanded')
  })
}

page.selectAll = element => {
  for (let i = 0; i < page.checkboxes.length; i++) {
    const id = page.getItemID(page.checkboxes[i])
    if (isNaN(id)) continue
    if (page.checkboxes[i].checked !== element.checked) {
      page.checkboxes[i].checked = element.checked
      if (page.checkboxes[i].checked) {
        page.selected[page.currentView].push(id)
      } else {
        page.selected[page.currentView].splice(page.selected[page.currentView].indexOf(id), 1)
      }
    }
  }

  if (page.selected[page.currentView].length) {
    localStorage[lsKeys.selected[page.currentView]] = JSON.stringify(page.selected[page.currentView])
  } else {
    delete localStorage[lsKeys.selected[page.currentView]]
  }

  element.title = element.checked ? 'Unselect all' : 'Select all'
}

page.selectInBetween = (element, lastElement) => {
  const thisIndex = parseInt(element.dataset.index)
  const lastIndex = parseInt(lastElement.dataset.index)

  const distance = Math.abs(thisIndex - lastIndex)
  if (distance < 2) return

  for (let i = 0; i < page.checkboxes.length; i++) {
    if ((thisIndex > lastIndex && i > lastIndex && i < thisIndex) ||
      (thisIndex < lastIndex && i > thisIndex && i < lastIndex)) {
      // Check or uncheck depending on the state of the initial checkbox
      const checked = page.checkboxes[i].checked = lastElement.checked
      const id = page.getItemID(page.checkboxes[i])
      if (!page.selected[page.currentView].includes(id) && checked) {
        page.selected[page.currentView].push(id)
      } else if (page.selected[page.currentView].includes(id) && !checked) {
        page.selected[page.currentView].splice(page.selected[page.currentView].indexOf(id), 1)
      }
    }
  }
}

page.select = (element, event) => {
  const id = page.getItemID(element)
  if (isNaN(id)) return

  if (event.shiftKey && page.lastSelected) {
    page.selectInBetween(element, page.lastSelected)
    // Check or uncheck depending on the state of the initial checkbox
    element.checked = page.lastSelected.checked
  } else {
    page.lastSelected = element
  }

  if (!page.selected[page.currentView].includes(id) && element.checked) {
    page.selected[page.currentView].push(id)
  } else if (page.selected[page.currentView].includes(id) && !element.checked) {
    page.selected[page.currentView].splice(page.selected[page.currentView].indexOf(id), 1)
  }

  // Update local storage
  if (page.selected[page.currentView].length) {
    localStorage[lsKeys.selected[page.currentView]] = JSON.stringify(page.selected[page.currentView])
  } else {
    delete localStorage[lsKeys.selected[page.currentView]]
  }
}

page.clearSelection = () => {
  const selected = page.selected[page.currentView]
  const type = page.getByView(page.currentView, 'type')
  const count = selected.length
  if (!count) return swal('An error occurred!', `You have not selected any ${type}.`, 'error')

  const suffix = count === 1 ? type.substring(0, type.length - 1) : type
  return swal({
    title: 'Are you sure?',
    text: `You are going to unselect ${count} ${suffix}.`,
    buttons: true
  }).then(proceed => {
    if (!proceed) return

    const checkboxes = page.checkboxes
    for (let i = 0; i < checkboxes.length; i++) {
      if (checkboxes[i].checked) {
        checkboxes[i].checked = false
      }
    }

    page.selected[page.currentView] = []
    delete localStorage[lsKeys.selected[page.currentView]]

    const selectAll = document.querySelector('#selectAll')
    if (selectAll) selectAll.checked = false

    return swal('Cleared selection!', `Unselected ${count} ${suffix}.`, 'success')
  })
}

page.uploadFiltersHelp = element => {
  const all = Boolean(element.dataset.all)
  const content = document.createElement('div')
  content.style = 'text-align: left'
  content.innerHTML = `${all
    ? `There are 2 filter keys, namely <b>user</b> (username) and <b>ip</b>.
    <b>user</b> and <b>ip</b> keys can be specified more than once.
    For usernames with whitespaces, wrap them with double quotes (<code>"</code>).
    To match uploads by non-registered users, or have no IPs respectively, use <code>user:-</code> or <code>ip:-</code>.

    To exclude certain users/IPs while still listing every other uploads, add negation sign (<code>-</code>) before the keys.
    Negation signs can also be used to exclude uploads by non-registered users, or have no IPs (i.e. <code>-user:-</code> or <code>-ip:-</code>).

    If you know the ID of a user's album, you can list its uploads with <b>albumid</b> key.
    Negation sign works for this key as well.`
    : `There is only 1 filter key, namely <b>albumid</b>.
    <b>albumid</b> key can be specified more than once.
    To match uploads with no albums, use <code>albumid:-</code>.

    To exclude certain albums while still listing every other uploads, add negation sign (<code>-</code>) before the keys.
    Negation sign can also be used to exclude uploads with no albums (i.e. <code>-albumid:-</code>).`}

    There are 2 range keys: <b>date</b> (upload date) and <b>expiry</b> (expiry date).
    Their formats are: <code>"YYYY/MM/DD HH:MM:SS-YYYY/MM/DD HH:MM:SS"</code> ("from" date and "to" date respectively),
    unix timestamps in seconds resolution, OR human-readable relative time duration (<a href="https://github.com/jkroso/parse-duration/tree/50ebcc8a971c753bd1162332ccf5f3ef1e0b3a7e#available-unit-types-are" target="_blank" rel="noopener">available units</a>).
    You may choose to specify only either dates.
    If "to" date is missing, 'now' will be used. If "from" date is missing, 'beginning of time' will be used.
    If any of the subsequent date or time units are not specified, their first value will be used (e.g. January for month, 1 for day, and so on).
    If only time is specified, today's date will be used.
    If you do not need to specify both date and time, you may omit the double quotes.
    In conclusion, the following examples are all valid: <code>date:"2020/01/01 01:23-2018/01/01 06"</code>, <code>expiry:-2020/05</code>, <code>date:12:34:56</code>, <code>date:1663976000</code>, <code>date:<7days</code>.
    <b>date</b> and <b>expiry</b> keys can only be specified once each.

    <b>What about timezones?</b>
    Feel free to query the dates in your own timezone.
    API requests to the filter endpoint will attach your browser's timezone offset, so the server will automatically calculate timezone differences.

    Matches can also be sorted with <b>sort</b> keys.
    Their format is: <code>sort:columnName[:d[escending]]</code>, where <code>:d[escending]</code> is an optional tag to set the direction to descending.
    This key must be used with internal column names used in the database (<code>id</code>, <code>${all ? 'userid' : 'albumid'}</code>, and so on),
    but there are 2 shortcuts available: <b>date</b> for <code>timestamp</code> column and <b>expiry</b> for <code>expirydate</code> column.
    Set your uploads view to "List view", then hover any of the table's column headers to see tooltips displaying their internal column names.
    <b>sort</b> key can be specified more than once, where their order will decide the sorting steps.

    Finally, there are type-<b>is</b> keys to refine by types.
    You can use <code>is:image</code>, <code>is:video</code>, and <code>is:audio</code> to list images, videos, audios respectively.
    This will only use image, video and audio extensions that are whitelisted internally in the safe.
    For images and videos specifically, they will be the ones whose thumbnails can be generated by the safe.
    Negation sign works for this key as well.
    Mixing inclusion and exclusion is not allowed (i.e. <code>is:image -is:video</code>), since the second key will be redundant.

    Alternatively, you can filter by their actual mime types using <b>type</b> keys.
    For example, <code>type:image/jpeg</code>, <code>type:video/mp4</code>.
    Negation sign works for this key as well.

    Any leftover keywords which do not use keys (non-keyed keywords) will be matched against the matches' randomly generated and original names.
    Excluding certain keywords is also supported by adding negation sign before the keywords.

    <b>Internal steps:</b>
    ${all
      ? `- Query uploads passing ALL exclusion filter keys OR matching ANY filter keys, if any.
    - Refine matches`
      : '- Filter uploads'} using <b>date</b> key, if any.
    - Refine matches using <b>expiry</b> key, if any.
    - Refine matches using type-<b>is</b> keys, if any.
    - Refine matches using <b>type</b> keys, if any.
    - Refine matches using ANY non-keyed keywords, if any.
    - Filter matches using ALL exclusion non-keyed keywords, if any.
    - Sort matches using <b>sort</b> keys, if any.

    <b>Examples:</b>
    ${all
      ? `- Uploads from users named "demo" AND/OR "John Doe" AND/OR non-registered users:
    <code>user:demo user:"John Doe" user:-</code>
    - ALL uploads, but NOT the ones from user named "demo" AND "John Doe":
    <code>-user:demo -user:"John Doe"</code>
    - Uploads from IP "127.0.0.1" AND which file names match "*.rar" OR "*.zip":
    <code>ip:127.0.0.1 *.rar *.zip</code>
    `
      : ''}- Uploads without albums:
    <code>albumid:-</code>
    - ALL uploads, but NOT the ones from album with ID 69:
    <code>-albumid:69</code>
    - Uploads uploaded since "1 June 2019 00:00:00":
    <code>date:2019/06</code>
    - Uploads uploaded between "7 April 2020 12:00:00" and "7 April 2020 23:59:59":
    <code>date:"2020/04/07 12-2020/04/07 23:59:59"</code>
    - Uploads uploaded before "5 February 2020 00:00:00":
    <code>date:-2020/02/05</code>
    - Uploads uploaded within the last 24 hours (1 day):
    <code>date:<1d</code>
    - Uploads uploaded before the last 6 months:
    <code>date:>6months</code>
    - Uploads that will expire within the next 7 days and 12 hours:
    <code>expiry:"<7 days 12 hours"</code>
    - Uploads which file names match "*.gz" but NOT "*.tar.gz":
    <code>*.gz -*.tar.gz</code>
    - Sort matches by "size" column in ascending and descending order respectively:
    <code>${all ? 'user:"John Doe"' : '*.txt'} sort:size</code>
    <code>*.mp4 ${all ? 'user:- ' : ''}sort:size:d</code>
    ${!page.permissions.moderator
      ? '<b>Notice:</b> Regular users may face some limitations in the amount of keys that can be used at a time.'
      : ''}
    <b>Friendly reminder:</b> This window can be scrolled up!
  `.trim().replace(/^\s*/g, '').replace(/\n/g, '<br>')

  swal({ content }).then(() => {
    // Restore modal size
    document.body.querySelector('.swal-overlay .swal-modal').classList.remove('is-expanded')
  })

  // Expand modal size
  document.body.querySelector('.swal-overlay .swal-modal:not(.is-expanded)').classList.add('is-expanded')
}

page.uniquifyUploadsFilters = string => {
  const filters = string
    .trim()
    .replace(/\t/g, ' ')
    .replace(/(^|\s)((albumid|ip|user|date|expiry|is|sort|orderby):)\s+/gi, '$2')
  const filtersArray = filters.split(' ')

  const uniquified = filtersArray
    .filter((v, i, a) => {
      // Filter out invalid values
      if (!v) return false

      const match = v.match(/^(sort|orderby):(\w+)(:.*)?$/i)
      // Uniquify sort/orderby filters by their keys
      if (match && match[2]) {
        const lastIndex = a.findLastIndex(v => {
          return new RegExp(`^(sort|orderby):${match[2]}(:.*)?$`, 'i').test(v)
        })
        return lastIndex === i
      }
      // Uniquify other filters by exact string matches
      return i === a.lastIndexOf(v)
    })

  return uniquified
}

page.filterUploads = element => {
  const filters = document.querySelector(`#${element.dataset.filtersid || 'filters'}`).value
  const filtersArray = page.uniquifyUploadsFilters(filters)

  // eslint-disable-next-line compat/compat
  page.getUploads(Object.assign(page.views[page.currentView], {
    filters: filtersArray.join(' '),
    pageNum: 0,
    trigger: element
  }))
}

page.sortUploads = element => {
  const title = element.title
  if (!title) return

  const _match = title.match(/^key: (.*)$/i)
  if (!_match || !_match[1]) return

  const defaultSort = element.dataset.defaultSort || 'asc'
  const regex = new RegExp(`^(sort|orderby):(${_match[1]})(:.*)?$`, 'i')

  const filters = document.querySelector('#filters').value
  const filtersArray = page.uniquifyUploadsFilters(filters)

  let direction = defaultSort
  const cleaned = filtersArray
    .filter((v, i, a) => {
      const match = v.match(regex)
      // Filter out sort filter(s) with the same key
      if (match && match[2]) {
        // Inverse sorting direction if required
        if (match[3]) {
          if (/^:d/i.test(match[3])) {
            direction = 'asc'
          } else {
            direction = 'desc'
          }
        }
        return false
      }
      return true
    })

  // Insert new sort filter
  cleaned.push(`sort:${_match[1]}:${direction}`)

  // eslint-disable-next-line compat/compat
  page.getUploads(Object.assign(page.views[page.currentView], {
    filters: cleaned.join(' '),
    pageNum: 0,
    trigger: element
  }))
}

page.filterUploadsWith = element => {
  const actionData = (element.dataset.actionData || '')
  const filtersArray = page.uniquifyUploadsFilters(actionData)

  page.getUploads({
    all: true,
    filters: filtersArray.join(' '),
    pageNum: 0,
    trigger: document.querySelector('#itemManageUploads')
  })
}

page.filterUploadsByType = element => {
  const text = element.innerText.trim()
  if (!text) return

  // Wrap type in quotes if it contains whitespaces
  const type = /\s/.test(text)
    ? `"${text}"`
    : text

  page.getUploads({
    all: true,
    filters: `type:${type}`,
    pageNum: 0,
    trigger: document.querySelector('#itemManageUploads')
  })
}

page.viewUserUploads = (id, element) => {
  const user = page.cache[id]
  if (!user) return

  element.classList.add('is-loading')

  // Wrap username in quotes if it contains whitespaces
  const username = /\s/.test(user.username)
    ? `"${user.username}"`
    : user.username

  page.getUploads({
    all: true,
    filters: `user:${username}`,
    trigger: document.querySelector('#itemManageUploads')
  })
}

page.viewAlbumUploads = (id, element) => {
  if (!page.cache[id]) return

  element.classList.add('is-loading')

  // eslint-disable-next-line compat/compat
  const all = page.currentView === 'albumsAll' && page.permissions.moderator

  page.getUploads({
    all,
    filters: `albumid:${id}`,
    trigger: all
      ? document.querySelector('#itemManageUploads')
      : document.querySelector('#itemUploads')
  })
}

page.deleteUpload = id => {
  page.postBulkDeleteUploads({
    all: page.currentView === 'uploadsAll',
    field: 'id',
    values: [id],
    cb (failed) {
      // Remove from remembered checkboxes if necessary
      if (!failed.length && page.selected[page.currentView].includes(id)) {
        page.selected[page.currentView].splice(page.selected[page.currentView].indexOf(id), 1)
      }

      // Update local storage
      if (page.selected[page.currentView].length) {
        localStorage[lsKeys.selected[page.currentView]] = JSON.stringify(page.selected[page.currentView])
      } else {
        delete localStorage[lsKeys.selected[page.currentView]]
      }

      // Reload upload list
      // eslint-disable-next-line compat/compat
      page.getUploads(Object.assign(page.views[page.currentView], {
        autoPage: true
      }))
    }
  })
}

page.bulkDeleteUploads = () => {
  const count = page.selected[page.currentView].length
  if (!count) {
    return swal('An error occurred!', 'You have not selected any uploads.', 'error')
  }

  page.postBulkDeleteUploads({
    all: page.currentView === 'uploadsAll',
    field: 'id',
    values: page.selected[page.currentView],
    cb (failed) {
      // Update state of checkboxes
      if (failed.length) {
        page.selected[page.currentView] = page.selected[page.currentView]
          .filter(id => failed.includes(id))
      } else {
        page.selected[page.currentView] = []
      }

      // Update local storage
      if (page.selected[page.currentView].length) {
        localStorage[lsKeys.selected[page.currentView]] = JSON.stringify(page.selected[page.currentView])
      } else {
        delete localStorage[lsKeys.selected[page.currentView]]
      }

      // Reload uploads list
      // eslint-disable-next-line compat/compat
      page.getUploads(Object.assign(page.views[page.currentView], {
        autoPage: true
      }))
    }
  })
}

page.deleteUploadsByNames = (params = {}) => {
  let appendix = ''
  if (page.permissions.moderator) {
    appendix = '<br><b>Hint:</b> You can use this feature to delete uploads by other users.'
  }

  page.dom.innerHTML = `
    <form class="prevent-default">
      <div class="field">
        <label class="label">Upload names:</label>
        <div class="control">
          <textarea id="bulkDeleteNames" class="textarea"></textarea>
        </div>
        <p class="help">Separate each entry with a new line.${appendix}</p>
      </div>
      <div class="field">
        <div class="control">
          <button type="submit" id="submitBulkDelete" class="button is-danger is-outlined is-fullwidth">
            <span class="icon">
              <i class="icon-trash"></i>
            </span>
            <span>Bulk delete</span>
          </button>
        </div>
      </div>
    </form>
  `
  page.fadeIn(page.dom)
  page.scrollTo(page.dom)
  page.updateTrigger(params.trigger, 'active')

  document.querySelector('#submitBulkDelete').addEventListener('click', () => {
    if (page.isSomethingLoading) return page.warnSomethingLoading()

    const textArea = document.querySelector('#bulkDeleteNames')

    // Clean up
    const seen = {}
    const names = textArea.value
      .split(/\r?\n/)
      .map(name => {
        const trimmed = name.trim()
        return /^[^\s]+$/.test(trimmed)
          ? trimmed
          : ''
      })
      .filter(name => {
        // Filter out invalid and duplicate names
        return (!name || Object.prototype.hasOwnProperty.call(seen, name))
          ? false
          : (seen[name] = true)
      })

    // Update textarea with cleaned names
    textArea.value = names.join('\n')

    if (!names.length) {
      return swal('An error occurred!', 'You have not entered any upload names.', 'error')
    }

    page.postBulkDeleteUploads({
      all: true,
      field: 'name',
      values: names,
      cb (failed) {
        textArea.value = failed.join('\n')
      }
    })
  })
}

page.postBulkDeleteUploads = (params = {}) => {
  const count = params.values.length

  const objective = `${params.values.length} upload${count === 1 ? '' : 's'}`
  const boldObjective = objective.replace(/^(\d*)(.*)/, '<b>$1</b>$2')
  let text = `<p>You won't be able to recover ${boldObjective}!</p>`

  if (params.all) {
    const obj1 = count === 1 ? 'an upload' : 'some uploads'
    const obj2 = count === 1 ? 'another user' : 'other users'
    text += `\n<p><b>Warning:</b> You may be nuking ${obj1} by ${obj2}!</p>`
  }

  const content = document.createElement('div')
  content.innerHTML = text

  swal({
    title: 'Are you sure?',
    content,
    icon: 'warning',
    dangerMode: true,
    buttons: {
      cancel: true,
      confirm: {
        text: `Yes, nuke ${params.values.length === 1 ? 'it' : 'them'}!`,
        closeModal: false
      }
    }
  }).then(proceed => {
    if (!proceed) return

    axios.post('api/upload/bulkdelete', {
      field: params.field,
      values: params.values
    }).then(response => {
      if (!response) return

      if (response.data.success === false) {
        if (response.data.description === 'No token provided') {
          return page.verifyToken(page.token)
        } else {
          return swal('An error occurred!', response.data.description, 'error')
        }
      }

      const failed = Array.isArray(response.data.failed) ? response.data.failed : []
      if (failed.length === params.values.length) {
        swal('An error occurred!', `Unable to delete any of the ${objective}.`, 'error')
      } else if (failed.length && failed.length < params.values.length) {
        swal('Warning!', `From ${objective}, unable to delete ${failed.length} of them.`, 'warning')
      } else {
        swal('Deleted!', `${objective} ${count === 1 ? 'has' : 'have'} been deleted.`, 'success', {
          buttons: false,
          timer: 1500
        })
      }

      if (typeof params.cb === 'function') params.cb(failed)
    }).catch(page.onAxiosError)
  })
}

page.addSelectedUploadsToAlbum = () => {
  if (page.currentView !== 'uploads') return

  const count = page.selected[page.currentView].length
  if (!count) return swal('An error occurred!', 'You have not selected any uploads.', 'error')

  page.addUploadsToAlbum(page.selected[page.currentView], failed => {
    if (!failed) return
    if (failed.length) {
      page.selected[page.currentView] = page.selected[page.currentView]
        .filter(id => failed.includes(id))
    } else {
      page.selected[page.currentView] = []
    }

    localStorage[lsKeys.selected[page.currentView]] = JSON.stringify(page.selected[page.currentView])
    page.getUploads(page.views[page.currentView])
  })
}

page.addToAlbum = id => {
  page.addUploadsToAlbum([id], failed => {
    if (!failed) return
    page.getUploads(page.views[page.currentView])
  })
}

page.addUploadsToAlbum = (ids, callback) => {
  const count = ids.length

  const content = document.createElement('div')
  content.innerHTML = `
    <div class="field has-text-centered">
      <p>You are about to add <b>${count}</b> upload${count === 1 ? '' : 's'} to an album.</p>
      <p><b>If an upload is already in an album, it will be moved.</b></p>
    </div>
    <div class="field">
      <div class="control">
        <div class="select is-fullwidth">
          <select id="swalAlbum" disabled>
            <option value="-1">Remove from album</option>
            <option value="" selected disabled>Fetching albums list\u2026</option>
          </select>
        </div>
      </div>
    </div>
  `

  swal({
    icon: 'warning',
    content,
    buttons: {
      cancel: true,
      confirm: {
        text: 'OK',
        closeModal: false
      }
    }
  }).then(choose => {
    if (!choose) return

    const albumid = parseInt(document.querySelector('#swalAlbum').value)
    if (isNaN(albumid)) return swal('An error occurred!', 'You did not choose an album.', 'error')

    axios.post('api/albums/addfiles', {
      ids,
      albumid
    }).then(add => {
      if (!add) return

      if (add.data.success === false) {
        if (add.data.description === 'No token provided') {
          page.verifyToken(page.token)
        } else {
          swal('An error occurred!', add.data.description, 'error')
        }
        return
      }

      let added = ids.length
      if (add.data.failed && add.data.failed.length) {
        added -= add.data.failed.length
      }

      const suffix = `upload${ids.length === 1 ? '' : 's'}`
      if (!added) return swal('An error occurred!', `Could not add the ${suffix} to the album.`, 'error')

      swal('Woohoo!', `Successfully ${albumid < 0 ? 'removed' : 'added'} ${added} ${suffix} ${albumid < 0 ? 'from' : 'to'} the album.`, 'success', {
        buttons: false,
        timer: 1500
      })
      callback(add.data.failed)
    }).catch(page.onAxiosError)
  })

  // Get albums list then update content of swal
  axios.get('api/albums', { headers: { simple: '1' } }).then(list => {
    if (list.data.success === false) {
      if (list.data.description === 'No token provided') {
        page.verifyToken(page.token)
      } else {
        swal('An error occurred!', list.data.description, 'error')
      }
      return
    }

    // If the prompt was replaced, the container would be missing
    const select = document.querySelector('#swalAlbum')
    if (!select) return

    select.innerHTML += list.data.albums
      .map(album => {
        return `<option value="${album.id}">${album.name}</option>`
      })
      .join('\n')

    select.getElementsByTagName('option')[1].innerHTML = 'Choose an album'
    select.removeAttribute('disabled')
  }).catch(page.onAxiosError)
}

page.getAlbums = (params = {}) => {
  if (params && params.all && !page.permissions.moderator) {
    return swal('An error occurred!', 'You cannot do this!', 'error')
  }

  if (page.isSomethingLoading) return page.warnSomethingLoading()

  page.updateTrigger(params.trigger, 'loading')

  if (typeof params.pageNum !== 'number') params.pageNum = 0

  const headers = {}
  if (params.all) headers.all = '1'

  const url = `api/albums/${params.pageNum}`
  axios.get(url, { headers }).then(response => {
    if (!response) return

    if (response.data.success === false) {
      if (response.data.description === 'No token provided') {
        return page.verifyToken(page.token)
      } else {
        page.updateTrigger(params.trigger)
        return swal('An error occurred!', response.data.description, 'error')
      }
    }

    const albumsPerPage = response.data.albumsPerPage || 25
    const pages = Math.ceil(response.data.count / albumsPerPage)
    const albums = response.data.albums
    if (params.pageNum && (albums.length === 0)) {
      page.updateTrigger(params.trigger)
      if (params.autoPage) {
        params.pageNum = pages - 1
        return page.getAlbums(params)
      } else {
        return swal('An error occurred!', `There are no more albums to populate page ${params.pageNum + 1}.`, 'error')
      }
    }

    page.currentView = params.all ? 'albumsAll' : 'albums'
    page.cache = {}

    const users = response.data.users
    const homeDomain = response.data.homeDomain || window.location.origin

    if (params.pageNum < 0) {
      params.pageNum = Math.max(0, pages + params.pageNum)
    }
    const pagination = page.paginate(response.data.count, albumsPerPage, params.pageNum)

    const filter = `
      <div class="column">
        <form class="prevent-default">
          <div class="field has-addons">
            <div class="control is-expanded">
              <input id="filters" class="input is-small" type="text" placeholder="Filter albums (WIP)" value="${page.escape(params.filters || '')}" disabled>
            </div>
            <div class="control">
              <button type="button" class="button is-small is-primary is-outlined" title="Help? (WIP)" data-action="album-filters-help" disabled>
                <span class="icon">
                  <i class="icon-help-circled"></i>
                </span>
              </button>
            </div>
            <div class="control">
              <button type="submit" class="button is-small is-info is-outlined" title="Filter albums (WIP)" data-action="filter-albums" disabled>
                <span class="icon">
                  <i class="icon-filter"></i>
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>
    `
    const extraControls = `
      <div class="columns">
        ${filter}
        <div class="column is-one-quarter">
          <form class="prevent-default">
            <div class="field has-addons">
              <div class="control is-expanded">
                <input id="jumpToPage" class="input is-small" type="number" min="1" max="${pages}" value="${params.pageNum + 1}"${pages === 1 ? ' disabled' : ''}>
              </div>
              <div class="control">
                <button type="submit" class="button is-small is-info is-outlined" title="Jump to page" data-action="jump-to-page">
                  <span class="icon">
                    <i class="icon-paper-plane"></i>
                  </span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    `

    const controls = `
      <div class="columns">
        <div class="column is-hidden-mobile"></div>
        <div class="column bulk-operations has-text-right">
          <a class="button is-small is-info is-outlined" title="Clear selection" data-action="clear-selection">
            <span class="icon">
              <i class="icon-cancel"></i>
            </span>
          </a>
          <a class="button is-small is-dangerish is-outlined" title="Bulk disable (WIP)" data-action="bulk-disable-albums" disabled>
            <span class="icon">
              <i class="icon-cancel"></i>
            </span>
            ${!params.all ? '<span>Bulk disable</span>' : ''}
          </a>
          ${params.all
            ? `<a class="button is-small is-danger is-outlined" title="Bulk delete (WIP)" data-action="bulk-delete-albums" disabled>
                <span class="icon">
                  <i class="icon-trash"></i>
                </span>
                <span>Bulk delete</span>
              </a>`
            : ''}
        </div>
      </div>
    `

    // Do some string replacements for bottom controls
    const bottomFiltersId = 'bFilters'
    const bottomJumpId = 'bJumpToPage'
    const bottomExtraControls = extraControls
      .replace(/id="filters"/, `id="${bottomFiltersId}"`)
      .replace(/(data-action="filter-uploads")/, `$1 data-filtersid="${bottomFiltersId}"`)
      .replace(/id="jumpToPage"/, `id="${bottomJumpId}"`)
      .replace(/(data-action="jump-to-page")/g, `$1 data-jumpid="${bottomJumpId}"`)
    const bottomPagination = pagination
      .replace(/(data-action="page-ellipsis")/g, `$1 data-jumpid="${bottomJumpId}"`)

    // Whether there are any unselected items
    let unselected = false

    const createNewAlbum = `
      <h2 class="subtitle">Create new album</h2>
      <form class="prevent-default">
        <div class="field">
          <div class="control">
            <input id="albumName" class="input" type="text" placeholder="Name" maxlength="${page.albumTitleMaxLength}">
          </div>
          <p class="help">Max length is ${page.albumTitleMaxLength} characters.</p>
        </div>
        <div class="field">
          <div class="control">
            <textarea id="albumDescription" class="textarea" placeholder="Description" rows="1" maxlength="${page.albumDescMaxLength}"></textarea>
          </div>
          <p class="help">Max length is ${page.albumDescMaxLength} characters.</p>
        </div>
        <div class="field">
          <div class="control">
            <button type="submit" id="submitAlbum" class="button is-info is-outlined is-fullwidth" data-action="submit-album">
              <span class="icon">
                <i class="icon-paper-plane"></i>
              </span>
              <span>Create</span>
            </button>
          </div>
        </div>
      </form>
      <hr>
    `

    page.dom.innerHTML = `
      ${!params.all ? createNewAlbum : ''}
      ${pagination}
      ${extraControls}
      ${controls}
      <div class="table-container has-text-left">
        <table class="table is-narrow is-fullwidth is-hoverable">
          <thead>
            <tr>
              <th><input id="selectAll" class="checkbox" type="checkbox" title="Select all" data-action="select-all"></th>
              <th>ID</th>
              <th>Name</th>
              ${params.all ? '<th>User</th>' : ''}
              <th>Uploads</th>
              <th>Size</th>
              <th>Created at</th>
              <th>ZIP size</th>
              <th>ZIP generated at</th>
              <th>Public link</th>
              <th class="has-text-right">(${response.data.count} total)</th>
            </tr>
          </thead>
          <tbody id="table">
          </tbody>
        </table>
      </div>
      ${controls}
      ${bottomExtraControls}
      ${bottomPagination}
    `

    const table = document.querySelector('#table')

    for (let i = 0; i < albums.length; i++) {
      const album = albums[i]
      const urlPath = '/a/'
      const albumUrlText = urlPath + album.identifier
      const albumUrl = homeDomain + albumUrlText

      const selected = page.selected[page.currentView].includes(album.id)
      if (!selected) {
        unselected = true
      }

      // Prettify
      album.hasZip = album.zipSize !== null
      album.prettyDate = page.getPrettyDate(new Date(album.timestamp * 1000))
      album.prettyZipDate = album.hasZip ? page.getPrettyDate(new Date(album.zipGeneratedAt * 1000)) : null
      album.isZipExpired = album.hasZip && !(album.zipGeneratedAt > album.editedAt)

      // Server-side explicitly expect this value to consider an album as disabled
      const enabled = album.enabled !== 0
      page.cache[album.id] = {
        name: album.name,
        download: album.download,
        public: album.public,
        description: album.description,
        descriptionHtml: album.descriptionHtml,
        enabled,
        homeDomain,
        urlPath,
        identifier: album.identifier
      }

      const tr = document.createElement('tr')
      tr.dataset.id = album.id
      tr.innerHTML = `
        <td class="controls"><input type="checkbox" class="checkbox" title="Select" data-index="${i}" data-action="select"${selected ? ' checked' : ''}></td>
        <th>${album.id}</th>
        <th${enabled ? '' : ' class="has-text-grey"'}>${album.name}</td>
        ${params.all ? `<th>${album.userid ? (users[album.userid] || '') : ''}</th>` : ''}
        <th>${album.uploads}</th>
        <td data-bytes="${album.size}">${page.getPrettyBytes(album.size)}</td>
        <td data-timestamp="${album.timestamp}">${album.prettyDate}</td>
        <td${album.hasZip ? ` data-bytes="${album.zipSize}"` : ''}>${album.hasZip ? page.getPrettyBytes(album.zipSize) : '-'}</td>
        <td${album.hasZip ? ` data-timestamp="${album.zipGeneratedAt}"` : ''}${album.isZipExpired ? ' class="has-text-warning" title="This album has been modified since the last time its ZIP was generated."' : ''}>${album.hasZip ? album.prettyZipDate : '-'}</td$>
        <td><a ${enabled && album.public ? '' : 'class="is-linethrough" '}href="${albumUrl}" target="_blank">${albumUrlText}</a></td>
        <td class="has-text-right" data-id="${album.id}">
          <a class="button is-small is-primary is-outlined" title="Edit album" data-action="edit-album">
            <span class="icon is-small">
              <i class="icon-pencil"></i>
            </span>
          </a>
          <a class="button is-small is-info is-outlined" title="${album.uploads ? 'View uploads' : 'Album doesn\'t have uploads'}" data-action="view-album-uploads" ${album.uploads ? '' : 'disabled'}>
            <span class="icon">
              <i class="icon-docs"></i>
            </span>
          </a>
          <a class="button is-small is-info is-outlined clipboard-js" title="Copy link to clipboard" ${album.public ? `data-clipboard-text="${albumUrl}"` : 'disabled'}>
            <span class="icon is-small">
              <i class="icon-clipboard"></i>
            </span>
          </a>
          <a class="button is-small is-warning is-outlined" title="Download album" ${enabled && album.download ? `href="api/album/zip/${album.identifier}?v=${album.editedAt}"` : 'disabled'}>
            <span class="icon is-small">
              <i class="icon-download"></i>
            </span>
          </a>
          <a class="button is-small is-dangerish is-outlined" title="Disable album" data-action="disable-album"${enabled ? '' : ' disabled'}>
            <span class="icon is-small">
              <i class="icon-cancel"></i>
            </span>
          </a>
          ${params.all
            ? `<a class="button is-small is-danger is-outlined" title="Delete album" data-action="delete-album">
              <span class="icon is-small">
                <i class="icon-trash"></i>
              </span>
            </a>`
            : ''}
        </td>
      `

      table.appendChild(tr)
      page.checkboxes = table.querySelectorAll('.checkbox[data-action="select"]')
    }

    const selectAll = document.querySelector('#selectAll')
    if (albums.length && selectAll && !unselected) {
      selectAll.checked = true
      selectAll.title = 'Unselect all'
    }

    page.fadeIn(page.dom)

    const pageNum = albums.length ? params.pageNum : 0
    if (params.forceScroll ||
      page.prevPageNums[page.currentView] === null ||
      page.prevPageNums[page.currentView] !== pageNum) {
      page.scrollTo(page.dom)
    }

    page.updateTrigger(params.trigger, 'active')

    if (page.currentView === 'albumsAll') {
      page.views[page.currentView].filters = params.filters
    }
    page.views[page.currentView].pageNum = page.prevPageNums[page.currentView] = pageNum
  }).catch(error => {
    page.updateTrigger(params.trigger)
    page.onAxiosError(error)
  })
}

page.editAlbum = id => {
  const album = page.cache[id]
  if (!album) return

  const albumUrlText = album.urlPath + album.identifier
  const albumUrl = album.homeDomain + albumUrlText

  const div = document.createElement('div')
  div.innerHTML = `
    <div class="field">
      <div class="controls">
        <input id="swalName" class="input" type="text" placeholder="Name" maxlength="${page.albumTitleMaxLength}" value="${(album.name || '').substring(0, page.albumTitleMaxLength)}">
      </div>
      <p class="help">Max length is ${page.albumTitleMaxLength} characters.</p>
    </div>
    <div class="field">
      <div class="control">
        <textarea id="swalDescription" class="textarea" placeholder="Description" rows="2" maxlength="${page.albumDescMaxLength}">${(album.description || '').substring(0, page.albumDescMaxLength)}</textarea>
      </div>
      <p class="help"><b>Markdown supported.</b> Max length is ${page.albumDescMaxLength} characters.</p>
    </div>
    ${album.descriptionHtml
      ? `<div class="field">
          <div class="content swal-display-description-preview">
            ${album.descriptionHtml}
          </div>
          <p class="help">Save changes then re-open this Edit prompt to refresh this preview.</p>
        </div>`
      : ''}
    ${page.currentView === 'albumsAll' && page.permissions.moderator
      ? `<div class="field">
          <div class="control">
            <label class="checkbox">
              <input id="swalEnabled" type="checkbox" ${album.enabled ? 'checked' : ''}>
              Enabled
            </label>
          </div>
        </div>`
      : ''}
    <div class="field">
      <div class="control">
        <label class="checkbox">
          <input id="swalDownload" type="checkbox" ${album.download ? 'checked' : ''}>
          Enable download
        </label>
      </div>
    </div>
    <div class="field">
      <div class="control">
        <label class="checkbox">
          <input id="swalPublic" type="checkbox" ${album.public ? 'checked' : ''}>
          Enable public link
        </label>
      </div>
    </div>
    <div class="field">
      <div class="control">
        <label class="checkbox">
          <input id="swalRequestLink" type="checkbox">
          Request new public link
        </label>
      </div>
    </div>
    <div class="field">
      <p>Current public link: <a href="${albumUrl}" target="_blank" class="is-underline">${albumUrlText}</a></p>
    </div>
  `

  swal({
    title: 'Edit album',
    icon: 'info',
    content: div,
    buttons: {
      cancel: true,
      confirm: {
        closeModal: false
      }
    }
  }).then(value => {
    if (!value) return

    const post = {
      id,
      name: document.querySelector('#swalName').value.trim(),
      description: document.querySelector('#swalDescription').value.trim(),
      download: document.querySelector('#swalDownload').checked,
      public: document.querySelector('#swalPublic').checked,
      requestLink: document.querySelector('#swalRequestLink').checked
    }

    if (page.currentView === 'albumsAll' && page.permissions.moderator) {
      post.enabled = document.querySelector('#swalEnabled').checked
    }

    axios.post('api/albums/edit', post).then(response => {
      if (!response) return

      if (response.data.success === false) {
        if (response.data.description === 'No token provided') {
          return page.verifyToken(page.token)
        } else {
          return swal('An error occurred!', response.data.description, 'error')
        }
      }

      if (response.data.identifier) {
        swal('Success!', `The album's new identifier is: ${response.data.identifier}.`, 'success')
      } else if (response.data.name !== album.name) {
        swal('Success!', `The album was renamed to: ${response.data.name}.`, 'success')
      } else {
        swal('Success!', 'The album was edited.', 'success', {
          buttons: false,
          timer: 1500
        })
      }

      page.getAlbumsSidebar()
      // Reload albums list
      // eslint-disable-next-line compat/compat
      page.getAlbums(Object.assign(page.views[page.currentView], {
        autoPage: true
      }))
    }).catch(page.onAxiosError)
  })
}

page.disableAlbum = id => {
  swal({
    title: 'Are you sure?',
    text: 'This won\'t delete the uploads associated with the album!',
    icon: 'warning',
    dangerMode: true,
    buttons: {
      cancel: true,
      confirm: {
        text: 'Yes, disable it!',
        closeModal: false
      },
      purge: {
        text: 'Umm, delete the uploads, please?',
        value: 'purge',
        className: 'swal-button--danger',
        closeModal: false
      }
    }
  }).then(proceed => {
    if (!proceed) return

    axios.post('api/albums/disable', {
      id,
      purge: proceed === 'purge'
    }).then(response => {
      if (response.data.success === false) {
        const failed = Array.isArray(response.data.failed)
          ? response.data.failed
          : []

        if (response.data.description === 'No token provided') {
          return page.verifyToken(page.token)
        } else if (failed.length) {
          return swal('An error occurred!', `Unable to delete ${failed.length} of the album's upload${failed.length === 1 ? '' : 's'}.`, 'error')
        } else {
          return swal('An error occurred!', response.data.description, 'error')
        }
      }

      swal('Disabled!', 'The album has been disabled.', 'success', {
        buttons: false,
        timer: 1500
      })

      page.getAlbumsSidebar()
      // Reload albums list
      // eslint-disable-next-line compat/compat
      page.getAlbums(Object.assign(page.views[page.currentView], {
        autoPage: true
      }))
    }).catch(page.onAxiosError)
  })
}

page.deleteAlbum = id => {
  swal({
    title: 'Are you sure?',
    text: 'You won\'t be able to recover this album!\n' +
      'This also won\'t delete the uploads associated with the album!',
    icon: 'warning',
    dangerMode: true,
    buttons: {
      cancel: true,
      confirm: {
        text: 'Yes, delete it!',
        closeModal: false
      },
      purge: {
        text: 'Umm, delete the uploads, please?',
        value: 'purge',
        className: 'swal-button--danger',
        closeModal: false
      }
    }
  }).then(proceed => {
    if (!proceed) return

    axios.post('api/albums/delete', {
      id,
      purge: proceed === 'purge'
    }).then(response => {
      if (response.data.success === false) {
        const failed = Array.isArray(response.data.failed)
          ? response.data.failed
          : []

        if (response.data.description === 'No token provided') {
          return page.verifyToken(page.token)
        } else if (failed.length) {
          return swal('An error occurred!', `Unable to delete ${failed.length} of the album's upload${failed.length === 1 ? '' : 's'}.`, 'error')
        } else {
          return swal('An error occurred!', response.data.description, 'error')
        }
      }

      swal('Disabled!', 'The album has been deleted.', 'success', {
        buttons: false,
        timer: 1500
      })

      page.getAlbumsSidebar()
      // Reload albums list
      // eslint-disable-next-line compat/compat
      page.getAlbums(Object.assign(page.views[page.currentView], {
        autoPage: true
      }))
    }).catch(page.onAxiosError)
  })
}

page.submitAlbum = element => {
  page.updateTrigger(element, 'loading')

  axios.post('api/albums', {
    name: document.querySelector('#albumName').value.trim(),
    description: document.querySelector('#albumDescription').value.trim()
  }).then(response => {
    if (!response) return

    page.updateTrigger(element)
    if (response.data.success === false) {
      if (response.data.description === 'No token provided') {
        return page.verifyToken(page.token)
      } else {
        return swal('An error occurred!', response.data.description, 'error')
      }
    }

    swal('Woohoo!', 'Album was created successfully.', 'success', {
      buttons: false,
      timer: 1500
    })
    page.getAlbumsSidebar()
    page.getAlbums({
      pageNum: -1
    })
  }).catch(error => {
    page.updateTrigger(element)
    page.onAxiosError(error)
  })
}

page.getAlbumsSidebar = () => {
  axios.get('api/albums', { headers: { simple: '1' } }).then(response => {
    if (!response) return

    if (response.data.success === false) {
      if (response.data.description === 'No token provided') {
        return page.verifyToken(page.token)
      } else {
        return swal('An error occurred!', response.data.description, 'error')
      }
    }

    const albums = response.data.albums
    const count = response.data.count
    const albumsSidebar = document.querySelector('#albumsSidebar')

    // Clear albums sidebar if necessary
    const oldAlbums = albumsSidebar.querySelectorAll('li > a')
    const diffCount = oldAlbums.length !== count
    if (oldAlbums.length) {
      for (let i = 0; i < oldAlbums.length; i++) {
        page.menus.splice(page.menus.indexOf(oldAlbums[i]), 1)
      }
      albumsSidebar.innerHTML = ''
    }

    page.albumsSidebarCollapse.innerText = page.albumsSidebarCollapsible.collapsed()
      ? page.albumsSidebarCollapse.dataset.textExpand
      : page.albumsSidebarCollapse.dataset.textCollapse

    if (!albums || !albums.length) {
      page.albumsSidebarCollapsible.collapse()
      page.albumsSidebarCollapse.setAttribute('disabled', 'disabled')
      return
    }

    for (let i = 0; i < albums.length; i++) {
      const album = albums[i]
      const li = document.createElement('li')
      const a = document.createElement('a')
      a.id = album.id
      a.className = 'is-relative'
      a.innerHTML = album.name

      a.addEventListener('click', event => {
        page.getUploads({
          album: parseInt(event.currentTarget.id),
          trigger: event.currentTarget
        })
      })
      page.menus.push(a)

      li.appendChild(a)
      albumsSidebar.appendChild(li)
    }

    page.albumsSidebarCollapse.removeAttribute('disabled')
    if (!page.albumsSidebarCollapsible.collapsed() && diffCount) {
      // Since it's not possible to refresh collapsible's height with bulmaCollapsible APIs,
      // forcefully collapse albums sidebar if albums count is different with the previous iteration.
      page.albumsSidebarCollapsible.collapse()
    }
  }).catch(page.onAxiosError)
}

page.changeToken = (params = {}) => {
  page.dom.innerHTML = `
    <div class="field">
      <label class="label">Your current token:</label>
      <div class="field">
        <div class="control">
          <input id="token" readonly class="input" type="text" placeholder="Your token" value="${page.token}">
        </div>
      </div>
    </div>
    <div class="field">
      <div class="control">
        <a id="getNewToken" class="button is-info is-outlined is-fullwidth">
          <span class="icon">
            <i class="icon-arrows-cw"></i>
          </span>
          <span>Request new token</span>
        </a>
      </div>
    </div>
  `
  page.fadeIn(page.dom)
  page.scrollTo(page.dom)
  page.updateTrigger(params.trigger, 'active')

  document.querySelector('#getNewToken').addEventListener('click', event => {
    if (page.isSomethingLoading) return page.warnSomethingLoading()

    const trigger = event.currentTarget
    page.updateTrigger(trigger, 'loading')
    axios.post('api/tokens/change').then(response => {
      if (response.data.success === false) {
        if (response.data.description === 'No token provided') {
          return page.verifyToken(page.token)
        } else {
          page.updateTrigger(trigger)
          return swal('An error occurred!', response.data.description, 'error')
        }
      }

      page.updateTrigger(trigger)
      swal({
        title: 'Woohoo!',
        text: 'Your token was successfully changed.',
        icon: 'success',
        buttons: false,
        timer: 1500
      }).then(() => {
        axios.defaults.headers.common.token = response.data.token
        localStorage[lsKeys.token] = response.data.token
        page.token = response.data.token
        page.changeToken()
      })
    }).catch(error => {
      page.updateTrigger(trigger)
      page.onAxiosError(error)
    })
  })
}

page.changePassword = (params = {}) => {
  page.dom.innerHTML = `
    <form class="prevent-default">
      <div class="field">
        <label class="label">New password:</label>
        <div class="control">
          <input id="password" class="input" type="password" minlength="6" maxlength="64">
        </div>
      </div>
      <div class="field">
        <label class="label">Re-type new password:</label>
        <div class="control">
          <input id="passwordConfirm" class="input" type="password" minlength="6" maxlength="64">
        </div>
      </div>
      <div class="field">
        <div class="control">
          <button type="submit" id="sendChangePassword" class="button is-info is-outlined is-fullwidth">
            <span class="icon">
              <i class="icon-paper-plane"></i>
            </span>
            <span>Set new password</span>
          </button>
        </div>
      </div>
    </form>
  `
  page.fadeIn(page.dom)
  page.scrollTo(page.dom)
  page.updateTrigger(params.trigger, 'active')

  document.querySelector('#sendChangePassword').addEventListener('click', event => {
    if (page.isSomethingLoading) return page.warnSomethingLoading()

    if (!page.dom.querySelector('form').checkValidity()) return

    if (document.querySelector('#password').value === document.querySelector('#passwordConfirm').value) {
      page.sendNewPassword(document.querySelector('#password').value, event.currentTarget)
    } else {
      swal({
        title: 'Password mismatch!',
        text: 'Your passwords do not match, please try again.',
        icon: 'error'
      })
    }
  })
}

page.sendNewPassword = (pass, element) => {
  page.updateTrigger(element, 'loading')

  axios.post('api/password/change', { password: pass }).then(response => {
    if (response.data.success === false) {
      if (response.data.description === 'No token provided') {
        return page.verifyToken(page.token)
      } else {
        page.updateTrigger(element)
        return swal('An error occurred!', response.data.description, 'error')
      }
    }

    page.updateTrigger(element)
    swal({
      title: 'Woohoo!',
      text: 'Your password was successfully changed.',
      icon: 'success',
      buttons: false,
      timer: 1500
    }).then(() => {
      page.changePassword()
    })
  }).catch(error => {
    page.updateTrigger(element)
    page.onAxiosError(error)
  })
}

page.getUsers = (params = {}) => {
  if (!page.permissions.admin) return swal('An error occurred!', 'You cannot do this!', 'error')

  if (page.isSomethingLoading) return page.warnSomethingLoading()

  page.updateTrigger(params.trigger, 'loading')

  if (typeof params.pageNum !== 'number') params.pageNum = 0

  const url = `api/users/${params.pageNum}`
  axios.get(url).then(response => {
    if (response.data.success === false) {
      if (response.data.description === 'No token provided') {
        return page.verifyToken(page.token)
      } else {
        page.updateTrigger(params.trigger)
        return swal('An error occurred!', response.data.description, 'error')
      }
    }

    const usersPerPage = response.data.usersPerPage || 25
    const pages = Math.ceil(response.data.count / usersPerPage)
    const users = response.data.users
    if (params.pageNum && (users.length === 0)) {
      page.updateTrigger(params.trigger)
      if (params.autoPage) {
        params.pageNum = pages - 1
        return page.getUsers(params)
      } else {
        return swal('An error occurred!', `There are no more users to populate page ${params.pageNum + 1}.`, 'error')
      }
    }

    page.currentView = 'users'
    page.cache = {}

    if (params.pageNum < 0) {
      params.pageNum = Math.max(0, pages + params.pageNum)
    }
    const pagination = page.paginate(response.data.count, usersPerPage, params.pageNum)

    const filter = `
      <div class="column">
        <form class="prevent-default">
          <div class="field has-addons">
            <div class="control is-expanded">
              <input id="filters" class="input is-small" type="text" placeholder="Filter users (WIP)" value="${page.escape(params.filters || '')}" disabled>
            </div>
            <div class="control">
              <button type="button" class="button is-small is-primary is-outlined" title="Help? (WIP)" data-action="user-filters-help" disabled>
                <span class="icon">
                  <i class="icon-help-circled"></i>
                </span>
              </button>
            </div>
            <div class="control">
              <button type="submit" class="button is-small is-info is-outlined" title="Filter users (WIP)" data-action="filter-users" disabled>
                <span class="icon">
                  <i class="icon-filter"></i>
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>
    `
    const extraControls = `
      <div class="columns">
        ${filter}
        <div class="column is-one-quarter">
          <form class="prevent-default">
            <div class="field has-addons">
              <div class="control is-expanded">
                <input id="jumpToPage" class="input is-small" type="number" min="1" max="${pages}" value="${params.pageNum + 1}"${pages === 1 ? ' disabled' : ''}>
              </div>
              <div class="control">
                <button type="submit" class="button is-small is-info is-outlined" title="Jump to page" data-action="jump-to-page">
                  <span class="icon">
                    <i class="icon-paper-plane"></i>
                  </span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    `

    const controls = `
      <div class="columns">
        <div class="column exclusive-operations has-text-left">
          <a class="button is-small is-primary is-outlined" title="Create new user" data-action="create-user">
            <span class="icon">
              <i class="icon-plus"></i>
            </span>
            <span>Create new user</span>
          </a>
        </div>
        <div class="column bulk-operations has-text-right">
          <a class="button is-small is-info is-outlined" title="Clear selection" data-action="clear-selection">
            <span class="icon">
              <i class="icon-cancel"></i>
            </span>
          </a>
          <a class="button is-small is-dangerish is-outlined" title="Bulk disable (WIP)" data-action="bulk-disable-users" disabled>
            <span class="icon">
              <i class="icon-hammer"></i>
            </span>
          </a>
          <a class="button is-small is-danger is-outlined" title="Bulk delete (WIP)" data-action="bulk-delete-users" disabled>
            <span class="icon">
              <i class="icon-trash"></i>
            </span>
            <span>Bulk delete</span>
          </a>
        </div>
      </div>
    `

    // Do some string replacements for bottom controls
    const bottomFiltersId = 'bFilters'
    const bottomJumpId = 'bJumpToPage'
    const bottomExtraControls = extraControls
      .replace(/id="filters"/, `id="${bottomFiltersId}"`)
      .replace(/(data-action="filter-uploads")/, `$1 data-filtersid="${bottomFiltersId}"`)
      .replace(/id="jumpToPage"/, `id="${bottomJumpId}"`)
      .replace(/(data-action="jump-to-page")/g, `$1 data-jumpid="${bottomJumpId}"`)
    const bottomPagination = pagination
      .replace(/(data-action="page-ellipsis")/g, `$1 data-jumpid="${bottomJumpId}"`)

    // Whether there are any unselected items
    let unselected = false

    page.dom.innerHTML = `
      ${pagination}
      ${extraControls}
      ${controls}
      <div class="table-container has-text-left">
        <table class="table is-narrow is-fullwidth is-hoverable">
          <thead>
            <tr>
              <th><input id="selectAll" class="checkbox" type="checkbox" title="Select all" data-action="select-all"></th>
              <th title="Key: username">Username</th>
              <th>Uploads</th>
              <th>Usage</th>
              <th title="Key: permission">Group</th>
              <th title="Key: registration">Registration date</th>
              <th title="Key: timestamp">Last token update</th>
              <th class="has-text-right">(${response.data.count} total)</th>
            </tr>
          </thead>
          <tbody id="table">
          </tbody>
        </table>
      </div>
      ${controls}
      ${bottomExtraControls}
      ${bottomPagination}
    `

    const table = document.querySelector('#table')

    for (let i = 0; i < users.length; i++) {
      const user = users[i]
      const selected = page.selected[page.currentView].includes(user.id)
      if (!selected) {
        unselected = true
      }

      let displayGroup = null
      const groups = Object.keys(user.groups)
      for (let i = 0; i < groups.length; i++) {
        if (!user.groups[groups[i]]) break
        displayGroup = groups[i]
      }

      // Server-side explicitly expects either of these two values to consider a user as disabled
      const enabled = user.enabled !== false && user.enabled !== 0
      page.cache[user.id] = {
        username: user.username,
        groups: user.groups,
        enabled,
        displayGroup
      }

      const prettyDate = user.registration
        ? page.getPrettyDate(new Date(user.registration * 1000))
        : '-'
      const prettyTokenUpdate = user.timestamp
        ? page.getPrettyDate(new Date(user.timestamp * 1000))
        : '-'

      const tr = document.createElement('tr')
      tr.dataset.id = user.id
      tr.innerHTML = `
        <td class="controls"><input type="checkbox" class="checkbox" title="Select" data-index="${i}" data-action="select"${selected ? ' checked' : ''}></td>
        <th${enabled ? '' : ' class="has-text-grey"'}>${user.username}</td>
        <th>${user.uploads}</th>
        <td>${page.getPrettyBytes(user.usage)}</td>
        <td>${displayGroup}</td>
        <td>${prettyDate}</td>
        <td>${prettyTokenUpdate}</td>
        <td class="controls has-text-right">
          <a class="button is-small is-primary is-outlined" title="Edit user" data-action="edit-user">
            <span class="icon">
              <i class="icon-pencil"></i>
            </span>
          </a>
          <a class="button is-small is-info is-outlined" title="${user.uploads ? 'View uploads' : 'User doesn\'t have uploads'}" data-action="view-user-uploads" ${user.uploads ? '' : 'disabled'}>
            <span class="icon">
              <i class="icon-docs"></i>
            </span>
          </a>
          <a class="button is-small is-dangerish is-outlined" title="${enabled ? 'Disable user' : 'User is disabled'}" data-action="disable-user" ${enabled ? '' : 'disabled'}>
            <span class="icon">
              <i class="icon-hammer"></i>
            </span>
          </a>
          <a class="button is-small is-danger is-outlined" title="Delete user" data-action="delete-user">
            <span class="icon">
              <i class="icon-trash"></i>
            </span>
          </a>
        </td>
      `

      table.appendChild(tr)
      page.checkboxes = table.querySelectorAll('.checkbox[data-action="select"]')
    }

    const selectAll = document.querySelector('#selectAll')
    if (users.length && selectAll && !unselected) {
      selectAll.checked = true
      selectAll.title = 'Unselect all'
    }

    page.fadeIn(page.dom)

    const pageNum = users.length ? params.pageNum : 0
    if (params.forceScroll ||
      page.prevPageNums[page.currentView] === null ||
      page.prevPageNums[page.currentView] !== pageNum) {
      page.scrollTo(page.dom)
    }

    page.updateTrigger(params.trigger, 'active')

    page.views[page.currentView].pageNum = page.prevPageNums[page.currentView] = pageNum
  }).catch(error => {
    page.updateTrigger(params.trigger)
    page.onAxiosError(error)
  })
}

page.createUser = () => {
  const groupOptions = Object.keys(page.permissions).map((g, i, a) => {
    const disabled = !(a[i + 1] && page.permissions[a[i + 1]])
    return `<option value="${g}"${disabled ? ' disabled' : ''}>${g}</option>`
  }).join('\n')

  const div = document.createElement('div')
  div.innerHTML = `
    <div class="field">
      <label class="label">Username</label>
      <div class="controls">
        <input id="swalUsername" class="input" type="text">
      </div>
    </div>
    <div class="field">
      <label class="label">Password (optional)</label>
      <div class="controls">
        <input id="swalPassword" class="input" type="text">
      </div>
    </div>
    <div class="field">
      <label class="label">User group</label>
      <div class="control">
        <div class="select is-fullwidth">
          <select id="swalGroup">
            ${groupOptions}
          </select>
        </div>
      </div>
    </div>
  `

  swal({
    title: 'Create new user',
    icon: 'info',
    content: div,
    buttons: {
      cancel: true,
      confirm: {
        closeModal: false
      }
    }
  }).then(proceed => {
    if (!proceed) return

    axios.post('api/users/create', {
      username: document.querySelector('#swalUsername').value,
      password: document.querySelector('#swalPassword').value,
      group: document.querySelector('#swalGroup').value
    }).then(response => {
      if (!response) return

      if (response.data.success === false) {
        if (response.data.description === 'No token provided') {
          return page.verifyToken(page.token)
        } else {
          return swal('An error occurred!', response.data.description, 'error')
        }
      }

      const div = document.createElement('div')
      div.innerHTML = `
        <p>Username: <b>${response.data.username}</b></p>
        <p>Password: <code>${response.data.password}</code></p>
        <p>User group: <b>${response.data.group}</b></p>
      `
      swal({
        title: 'Created a new user!',
        icon: 'success',
        content: div
      })

      // Load last page of users list
      // eslint-disable-next-line compat/compat
      page.getUsers(Object.assign(page.views.users, {
        pageNum: -1
      }))
    }).catch(page.onAxiosError)
  })
}

page.editUser = id => {
  const user = page.cache[id]
  if (!user) return

  let isHigher = false
  const groupOptions = Object.keys(page.permissions).map((g, i, a) => {
    const selected = g === user.displayGroup
    if (selected) {
      isHigher = typeof a[i + 1] !== 'undefined' && page.permissions[a[i + 1]]
    }
    const disabled = !(a[i + 1] && page.permissions[a[i + 1]])
    return `<option value="${g}"${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}>${g}</option>`
  }).join('\n')

  const isDisabledHelper = isHigher ? '' : ' disabled'
  const div = document.createElement('div')
  div.innerHTML = `
    <div class="field">
      <p>User ID: ${id}</p>
    </div>
    <div class="field">
      <label class="label">Username</label>
      <div class="controls">
        <input id="swalUsername" class="input" type="text" value="${user.username || ''}"${isDisabledHelper}>
      </div>
    </div>
    <div class="field">
      <label class="label">User group</label>
      <div class="control">
        <div class="select is-fullwidth">
          <select id="swalGroup"${isDisabledHelper}>
            ${groupOptions}
          </select>
        </div>
      </div>
    </div>
    <div class="field">
      <div class="control">
        <label class="checkbox">
          <input id="swalEnabled" type="checkbox"${user.enabled ? ' checked' : ''}${isDisabledHelper}>
          Enabled
        </label>
      </div>
    </div>
    <div class="field">
      <div class="control">
        <label class="checkbox">
          <input id="swalResetPassword" type="checkbox"${isDisabledHelper}>
          Reset password
        </label>
      </div>
    </div>
    ${isHigher
      ? ''
      : `<div class="notification is-danger">
      You <b>cannot</b> modify user in the same or higher group as you.
    </div>`
    }
  `

  swal({
    title: 'Edit user',
    icon: 'info',
    content: div,
    buttons: {
      cancel: true,
      confirm: {
        closeModal: false
      }
    }
  }).then(proceed => {
    if (!proceed) return

    axios.post('api/users/edit', {
      id,
      username: document.querySelector('#swalUsername').value,
      group: document.querySelector('#swalGroup').value,
      enabled: document.querySelector('#swalEnabled').checked,
      resetPassword: document.querySelector('#swalResetPassword').checked
    }).then(response => {
      if (!response) return

      if (response.data.success === false) {
        if (response.data.description === 'No token provided') {
          return page.verifyToken(page.token)
        } else {
          return swal('An error occurred!', response.data.description, 'error')
        }
      }

      let autoClose = true
      const div = document.createElement('div')

      let displayName = user.username
      if (response.data.update.username !== user.username) {
        div.innerHTML += `<p>${user.username} was renamed into: <b>${response.data.update.username}</b>.</p>`
        autoClose = false
        displayName = response.data.update.username
      }

      if (response.data.update.password) {
        div.innerHTML += `
          <p>${displayName}'s new password is:</p>
          <p><code>${response.data.update.password}</code></p>
        `
        autoClose = false
      }

      if (response.data.update.enabled !== user.enabled) {
        div.innerHTML += `<p>${displayName} has been ${response.data.update.enabled ? 'enabled' : 'disabled'}!</p>`
      }

      if (!div.innerHTML) {
        div.innerHTML = `<p>${displayName} was edited!</p>`
      }

      swal({
        title: 'Success!',
        icon: 'success',
        content: div,
        buttons: !autoClose,
        timer: autoClose ? 1500 : null
      })
      page.getUsers(page.views.users)
    }).catch(page.onAxiosError)
  })
}

page.disableUser = id => {
  const user = page.cache[id]
  if (!user || !user.enabled) return

  const content = document.createElement('div')
  content.innerHTML = `
    <p>You will be disabling a user named <b>${page.cache[id].username}</b>.</p>
    <p>Their files will remain.</p>
  `

  swal({
    title: 'Are you sure?',
    icon: 'warning',
    content,
    dangerMode: true,
    buttons: {
      cancel: true,
      confirm: {
        text: 'Yes, disable them!',
        closeModal: false
      }
    }
  }).then(proceed => {
    if (!proceed) return

    axios.post('api/users/disable', { id }).then(response => {
      if (!response) return

      if (response.data.success === false) {
        if (response.data.description === 'No token provided') {
          return page.verifyToken(page.token)
        } else {
          return swal('An error occurred!', response.data.description, 'error')
        }
      }

      swal('Success!', `${page.cache[id].username} has been disabled.`, 'success', {
        buttons: false,
        timer: 1500
      })
      page.getUsers(page.views.users)
    }).catch(page.onAxiosError)
  })
}

page.deleteUser = id => {
  const user = page.cache[id]
  if (!user) return

  const content = document.createElement('div')
  content.innerHTML = `
    <p>You will be deleting a user named <b>${page.cache[id].username}</b>.<p>
    <p>Their uploads will still remain, unless you choose otherwise.</p>
  `

  swal({
    title: 'Are you sure?',
    icon: 'warning',
    content,
    dangerMode: true,
    buttons: {
      cancel: true,
      confirm: {
        text: 'Yes, ONLY the user!',
        closeModal: false
      },
      purge: {
        text: 'Yes, AND their uploads too!',
        value: 'purge',
        className: 'swal-button--danger',
        closeModal: false
      }
    }
  }).then(proceed => {
    if (!proceed) return

    axios.post('api/users/delete', {
      id,
      purge: proceed === 'purge'
    }).then(response => {
      if (!response) return

      if (response.data.success === false) {
        const failed = Array.isArray(response.data.failed)
          ? response.data.failed
          : []

        if (response.data.description === 'No token provided') {
          return page.verifyToken(page.token)
        } else if (failed.length) {
          return swal('An error occurred!', `Unable to delete ${failed.length} of the user's upload${failed.length === 1 ? '' : 's'}.`, 'error')
        } else {
          return swal('An error occurred!', response.data.description, 'error')
        }
      }

      swal('Success!', `${page.cache[id].username} has been deleted.`, 'success', {
        buttons: false,
        timer: 1500
      })

      // Reload users list
      // eslint-disable-next-line compat/compat
      page.getUsers(Object.assign(page.views.users, {
        autoPage: true
      }))
    }).catch(page.onAxiosError)
  })
}

// Roughly based on https://github.com/mayuska/pagination/blob/03cac0fb8af3a759bc1220bd3c011b67dbc5e909/index.js
page.paginate = (totalItems, itemsPerPage, currentPage) => {
  currentPage = currentPage + 1
  const step = 3
  const numPages = Math.ceil(totalItems / itemsPerPage)

  let template = ''
  const elementsToShow = step * 2
  const add = {
    pageNum (start, end) {
      for (let i = start; i <= end; ++i) {
        template += `<li><a class="button pagination-link ${i === currentPage ? ' is-current' : ''}" aria-label="Goto page ${i}" data-action="page-goto" data-goto="${i - 1}">${i}</a></li>`
      }
    },
    startDots () {
      template += `
        <li><a class="button pagination-link" aria-label="Goto page 1" data-action="page-goto" data-goto="0">1</a></li>
        <li data-action="page-ellipsis"><span class="pagination-ellipsis">&hellip;</span></li>
      `
    },
    endDots () {
      template += `
        <li data-action="page-ellipsis"><span class="pagination-ellipsis">&hellip;</span></li>
        <li><a class="button pagination-link" aria-label="Goto page ${numPages}" data-action="page-goto" data-goto="${numPages - 1}">${numPages}</a></li>
      `
    }
  }

  if (elementsToShow + 1 >= numPages) {
    add.pageNum(1, numPages)
  } else if (currentPage < elementsToShow) {
    add.pageNum(1, elementsToShow)
    add.endDots()
  } else if (currentPage > numPages - elementsToShow + 1) {
    add.startDots()
    add.pageNum(numPages - elementsToShow + 1, numPages)
  } else {
    add.startDots()
    add.pageNum(currentPage - step + 1, currentPage + step - 1)
    add.endDots()
  }

  return `
    <nav class="pagination is-centered is-small">
      <a class="button pagination-previous" data-action="page-prev"${currentPage === 1 ? ' disabled' : ''}>Previous</a>
      <a class="button pagination-next" data-action="page-next"${currentPage >= numPages ? ' disabled' : ''}>Next page</a>
      <ul class="pagination-list">${template}</ul>
    </nav>
  `
}

page.buildStatisticTable = (title, stats) => {
  const meta = []
  let statsKey = ''
  let rows = ''

  if (!stats) {
    rows += `
      <tr>
        <td>Still being generated, please try again later\u2026</td>
        <td></td>
      </tr>
    `
  } else {
    try {
      const keys = Object.keys(stats)

      for (let j = 0; j < keys.length; j++) {
        // Skip meta
        if (keys[j] === 'meta') {
          continue
        }

        const data = stats[keys[j]]
        const isDataObj = typeof data === 'object' && data

        const type = (isDataObj && data.type) || 'auto'
        // Skip hidden
        if (type === 'hidden') {
          continue
        }

        const value = isDataObj ? data.value : data
        let parsed = void 0

        switch (type) {
          case 'byte':
            parsed = page.getPrettyBytes(value)
            break
          case 'byteUsage': {
            if (typeof value === 'object') {
              // Reasoning: https://github.com/sebhildebrandt/systeminformation/issues/464#issuecomment-756406053
              const totalForPercentage = typeof value.available !== 'undefined'
                ? (value.used + value.available)
                : value.total
              parsed = `${page.getPrettyBytes(value.used)} / ${page.getPrettyBytes(value.total)} (${(value.used / totalForPercentage * 100).toFixed(2)}%)`
            } else {
              parsed = value
            }
            break
          }
          case 'detailed':
            parsed = `
              <table class="table is-narrow is-fullwidth is-hoverable">
                <tbody>
                  ${Object.keys(value).map(type => {
                    let detailedValue = void 0
                    switch (typeof value[type]) {
                      case 'number':
                        detailedValue = value[type].toLocaleString()
                        break
                      default:
                        detailedValue = value[type]
                    }
                    return `
                      <tr>
                        <th${data.valueAction ? ` data-action="${data.valueAction}"` : ''}>${type}</th>
                        <td>${detailedValue}</td>
                      </tr>
                    `
                  }).join('\n')}
                </tbody>
              </table>
            `
            break
          case 'tempC':
            // TODO: Unit conversion when required?
            parsed = typeof value === 'number'
              ? `${value} C`
              : value
            break
          case 'uptime':
            parsed = page.getPrettyUptime(value)
            break
          case 'unavailable':
            parsed = 'N/A'
            break
          case 'auto':
            switch (typeof value) {
              case 'number':
                parsed = value.toLocaleString()
                break
              default:
                parsed = value
            }
            break
          default:
            parsed = value
        }

        let keyAttrs = ''
        if (isDataObj && data.action) {
          keyAttrs += ` data-action="${data.action}"`
          if (data.actionData) {
            keyAttrs += ` data-action-data="${data.actionData}"`
          }
        }

        rows += `
          <tr>
            <th${keyAttrs}>${keys[j]}</th$>
            <td>${parsed}</td>
          </tr>
        `
      }

      if (typeof stats.meta !== 'undefined') {
        // Reload key
        if (typeof stats.meta.key === 'string') {
          statsKey = stats.meta.key
          meta.push(`<i class="icon-arrows-cw" data-action="reload-stats-category" data-key="${stats.meta.key}"></i>`)
        }
        // generatedOn
        if (typeof stats.meta.generatedOn !== 'undefined') {
          meta.push(`Generated on ${page.getPrettyDate(new Date(stats.meta.generatedOn))}`)
        }
        // maxAge
        if (typeof stats.meta.maxAge === 'number') {
          meta.push(`(${stats.meta.maxAge / 1000}s)`)
        } else {
          meta.push('(auto)')
        }
      }
    } catch (error) {
      rows = `
        <tr>
          <td>Error parsing response. Try again?</td>
          <td></td>
        </tr>
      `
      page.onError(error)
    }
  }

  return `
    <div${statsKey ? ` id="stats-${statsKey}"` : ''} class="table-container has-text-left">
      <table class="table statistics is-narrow is-fullwidth is-hoverable">
        <thead>
          <tr>
            <th class="capitalize">${title}</th>
            <td class="has-text-right">${meta.join(' ')}</td>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `
}

page.getStatistics = (params = {}) => {
  if (!page.permissions.admin) return swal('An error occurred!', 'You cannot do this!', 'error')

  if (page.isSomethingLoading) return page.warnSomethingLoading()

  page.updateTrigger(params.trigger, 'loading')

  const url = 'api/stats'
  axios.get(url).then(response => {
    if (response.data.success === false) {
      if (response.data.description === 'No token provided') {
        return page.verifyToken(page.token)
      } else {
        page.updateTrigger(params.trigger)
        return swal('An error occurred!', response.data.description, 'error')
      }
    }

    let content = ''

    const keys = Object.keys(response.data.stats)
    for (let i = 0; i < keys.length; i++) {
      content += page.buildStatisticTable(keys[i], response.data.stats[keys[i]])
    }

    if (Array.isArray(response.data.hrtime)) {
      content += `
        <article id="stats-hrtime" class="message is-size-7">
          <div class="message-body has-text-left">
            Time taken: ${response.data.hrtime[0]}s ${Math.ceil(response.data.hrtime[1] / 1000000)}ms.
          </div>
        </article>
      `
    }

    page.dom.innerHTML = content
    page.fadeIn(page.dom)
    page.scrollTo(page.dom)
    page.updateTrigger(params.trigger, 'active')
  }).catch(error => {
    page.updateTrigger(params.trigger)
    page.onAxiosError(error)
  })
}

page.getStatisticsCategory = (params = {}) => {
  if (!page.permissions.admin) return swal('An error occurred!', 'You cannot do this!', 'error')

  if (page.isSomethingLoading) return page.warnSomethingLoading()

  if (!params.key) return swal('An error occurred!', 'Missing stats category key!', 'error')

  page.updateTrigger(params.trigger, 'loading')

  const url = `api/stats/${params.key}`
  axios.get(url).then(response => {
    if (response.data.success === false) {
      if (response.data.description === 'No token provided') {
        return page.verifyToken(page.token)
      } else {
        page.updateTrigger(params.trigger)
        return swal('An error occurred!', response.data.description, 'error')
      }
    }

    const [title, stats] = Object.entries(response.data.stats).find(([name, stats]) => {
      return stats && stats.meta && stats.meta.key === params.key
    })
    if (!title) {
      return swal('An error occurred!', 'Server did not return required stats data.', 'error')
    }

    const statsTable = document.querySelector(`#stats-${params.key}`)
    if (!statsTable) return

    statsTable.innerHTML = page.buildStatisticTable(title, stats)

    if (Array.isArray(response.data.hrtime)) {
      const statsHrTime = document.querySelector('#stats-hrtime')
      if (statsHrTime) {
        statsHrTime.innerHTML = `
          <article class="message is-size-7">
            <div class="message-body has-text-left">
              Time taken: ${response.data.hrtime[0]}s ${Math.ceil(response.data.hrtime[1] / 1000000)}ms.
            </div>
          </article>
        `
      }
    }

    page.fadeIn(statsTable)
    page.updateTrigger(params.trigger, 'active')
  }).catch(error => {
    page.updateTrigger(params.trigger)
    page.onAxiosError(error)
  })
}

page.reloadStatsCategory = element => {
  const key = element.dataset.key
  if (!key) return

  page.getStatisticsCategory({
    key,
    trigger: document.querySelector('#itemStatistics')
  })
}

window.addEventListener('DOMContentLoaded', () => {
  // Polyfill Object.assign()
  // eslint-disable-next-line compat/compat
  if (typeof Object.assign !== 'function') {
    // Must be writable: true, enumerable: false, configurable: true
    Object.defineProperty(Object, 'assign', {
      value: function assign (target, varArgs) { // .length of function is 2
        'use strict'
        if (target === null || typeof target === 'undefined') {
          throw new TypeError('Cannot convert undefined or null to object')
        }
        const to = Object(target)
        for (let i = 1; i < arguments.length; i++) {
          const nextSource = arguments[i]
          if (nextSource !== null && typeof nextSource !== 'undefined') {
            for (const nextKey in nextSource) {
              // Avoid bugs when hasOwnProperty is shadowed
              if (Object.prototype.hasOwnProperty.call(nextSource, nextKey)) {
                to[nextKey] = nextSource[nextKey]
              }
            }
          }
        }
        return to
      },
      writable: true,
      configurable: true
    })
  }

  // Add 'no-touch' class to non-touch devices
  if (!('ontouchstart' in document.documentElement)) {
    document.documentElement.classList.add('no-touch')
  }

  const selectedKeys = ['uploads', 'uploadsAll', 'albums', 'albumsAll', 'users']
  for (let i = 0; i < selectedKeys.length; i++) {
    const ls = localStorage[lsKeys.selected[selectedKeys[i]]]
    if (ls) page.selected[selectedKeys[i]] = JSON.parse(ls)
  }

  page.preparePage()

  page.clipboardJS = new ClipboardJS('.clipboard-js')

  page.clipboardJS.on('success', () => {
    return swal('', 'The link has been copied to clipboard.', 'success', {
      buttons: false,
      timer: 1500
    })
  })

  page.clipboardJS.on('error', page.onError)

  page.lazyLoad = new LazyLoad()

  page.albumsSidebarCollapse = document.querySelector('#albumsSidebarCollapse')

  /* eslint-disable-next-line new-cap */
  page.albumsSidebarCollapsible = new bulmaCollapsible(document.querySelector('#albumsSidebar'))
  page.albumsSidebarCollapsible.on('before:expand', event => {
    page.albumsSidebarCollapse.innerText = page.albumsSidebarCollapse.dataset.textCollapse
  })
  page.albumsSidebarCollapsible.on('before:collapse', event => {
    page.albumsSidebarCollapse.innerText = page.albumsSidebarCollapse.dataset.textExpand
  })
})
