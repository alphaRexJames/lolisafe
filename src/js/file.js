/* global swal, axios, ClipboardJS */

const lsKeys = {
  token: 'token'
}

const page = {
  // user token
  token: localStorage[lsKeys.token],

  urlPrefix: null,
  urlIdentifier: null,

  messageElement: document.querySelector('#message'),
  fileinfoContainer: document.querySelector('#fileinfo'),

  clipboardBtn: document.querySelector('#clipboardBtn'),
  playerBtn: document.querySelector('#playerBtn'),
  downloadBtn: document.querySelector('#downloadBtn'),
  deleteBtn: document.querySelector('#deleteBtn'),
  uploadRoot: null,
  titleFormat: null,

  file: null,
  clipboardJS: null
}

page.updateMessageBody = content => {
  page.messageElement.querySelector('.message-body').innerHTML = content
  page.messageElement.classList.remove('is-hidden')
}

// Handler for regular JS errors
page.onError = error => {
  console.error(error)
  page.updateMessageBody(`
    <p><strong>An error occurred!</strong></p>
    <p><code>${error.toString()}</code></p>
    <p>Please check your console for more information.</p>
  `)
}

// Handler for Axios errors
page.onAxiosError = error => {
  // Better Cloudflare errors
  const cloudflareErrors = {
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

  const statusText = cloudflareErrors[error.response.status] || error.response.statusText

  const description = error.response.data && error.response.data.description
    ? error.response.data.description
    : ''
  page.updateMessageBody(`
    <p><strong>${error.response.status} ${statusText}</strong></p>
    <p>${description}</p>
  `)
}

page.deleteFile = () => {
  if (!page.file) return

  const content = document.createElement('div')
  content.innerHTML = '<p>You won\'t be able to recover this file!</p>'

  swal({
    title: 'Are you sure?',
    content,
    icon: 'warning',
    dangerMode: true,
    buttons: {
      cancel: true,
      confirm: {
        text: 'Yes, nuke it!',
        closeModal: false
      }
    }
  }).then(proceed => {
    if (!proceed) return

    axios.post('../api/upload/delete', {
      id: page.file.id
    }).then(response => {
      if (!response) return

      if (response.data.success === false) {
        return swal('An error occurred!', response.data.description, 'error')
      }

      const failed = Array.isArray(response.data.failed) ? response.data.failed : []
      if (failed.length) {
        swal('An error occurred!', 'Unable to delete this file.', 'error')
      } else {
        swal('Deleted!', 'This file has been deleted.', 'success', {
          buttons: false
        })
      }
    }).catch(page.onAxiosError)
  })
}

page.loadFileinfo = () => {
  if (!page.urlIdentifier) return

  axios.get(`../api/upload/get/${page.urlIdentifier}`).then(response => {
    if (![200, 304].includes(response.status)) {
      return page.onAxiosError(response)
    }

    page.file = response.data.file

    if (page.titleFormat) {
      document.title = page.titleFormat.replace(/%identifier%/g, page.file.name)
    }

    let rows = ''
    const keys = Object.keys(page.file)
    for (let i = 0; i < keys.length; i++) {
      const value = page.file[keys[i]]

      let prettyValue = ''
      if (value) {
        if (['size'].includes(keys[i])) {
          prettyValue = page.getPrettyBytes(value)
        } else if (['timestamp', 'expirydate'].includes(keys[i])) {
          prettyValue = page.getPrettyDate(new Date(value * 1000))
        }
      }

      rows += `
        <tr>
          <th class="capitalize">${keys[i]}</th>
          <td>${value}</td>
          <td>${prettyValue}</td>
        </tr>
      `
    }

    document.querySelector('#title').innerText = page.file.name
    page.fileinfoContainer.querySelector('.table-container').innerHTML = `
      <div class="table-container has-text-left">
        <table id="statistics" class="table is-fullwidth is-hoverable">
          <thead>
            <tr>
              <th>Fields</th>
              <td>Values</td>
              <td></td>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `

    const fileUrl = `${page.uploadRoot}/${page.file.name}`
    page.downloadBtn.setAttribute('href', fileUrl)
    page.clipboardBtn.dataset.clipboardText = fileUrl

    const img = page.fileinfoContainer.querySelector('img')
    img.setAttribute('alt', page.file.name || '')
    img.src = `${page.uploadRoot}/${page.file.name}`
    img.parentNode.classList.remove('is-hidden')
    img.onerror = event => event.currentTarget.parentNode.classList.add('is-hidden')

    const isvideo = page.file.type.startsWith('video/')
    const isaudio = page.file.type.startsWith('audio/')
    if (isvideo || isaudio) {
      page.playerBtn.setAttribute('href', `../v/${page.file.name}`)
      page.playerBtn.parentNode.parentNode.classList.remove('is-hidden')
    }

    page.fileinfoContainer.classList.remove('is-hidden')
    page.messageElement.classList.add('is-hidden')

    if (page.urlParams.has('delete')) {
      page.deleteBtn.click()
    }
  }).catch(error => {
    if (typeof error.response !== 'undefined') page.onAxiosError(error)
    else page.onError(error)
  })
}

window.addEventListener('DOMContentLoaded', () => {
  // Partial polyfill URLSearchParams.has()
  // eslint-disable-next-line compat/compat
  window.URLSearchParams = window.URLSearchParams || function (searchString) {
    const self = this
    self.has = function (name) {
      const results = new RegExp('[?&]' + name).exec(self.searchString)
      if (results == null) {
        return false
      } else {
        return true
      }
    }
  }

  axios.defaults.headers.common.token = page.token

  const mainScript = document.querySelector('#mainScript')
  if (!mainScript || typeof mainScript.dataset.uploadRoot === 'undefined') return

  page.uploadRoot = mainScript.dataset.uploadRoot
  page.titleFormat = mainScript.dataset.titleFormat

  let urlPrefix = window.location.protocol + '//' + window.location.host
  const match = window.location.pathname.match(/.*\/(.*)$/)
  if (!match || !match[1]) {
    return page.updateMessageBody('<p>Failed to parse upload identifier from URL.</p>')
  }

  page.urlIdentifier = match[1]
  urlPrefix += window.location.pathname.substring(0, window.location.pathname.indexOf(match[1]))
  page.urlPrefix = urlPrefix

  // eslint-disable-next-line compat/compat
  page.urlParams = new URLSearchParams(window.location.search)

  page.clipboardJS = new ClipboardJS('.clipboard-js')

  page.clipboardJS.on('success', () => {
    return swal('', 'The link has been copied to clipboard.', 'success', {
      buttons: false,
      timer: 1500
    })
  })

  page.clipboardJS.on('error', page.onError)

  page.deleteBtn.addEventListener('click', page.deleteFile)

  page.loadFileinfo()
})
