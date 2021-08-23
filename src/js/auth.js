/* global swal, axios */

const lsKeys = {
  token: 'token'
}

const page = {
  // user token
  token: localStorage[lsKeys.token],

  // HTML elements
  user: null,
  pass: null
}

page.unhide = () => {
  const loaderSection = document.querySelector('#loader')
  if (loaderSection) loaderSection.classList.add('is-hidden')

  const loginSection = document.querySelector('#login.is-hidden')
  if (loginSection) loginSection.classList.remove('is-hidden')

  const floatingBtn = document.querySelector('.floating-home-button.is-hidden')
  if (floatingBtn) floatingBtn.classList.remove('is-hidden')
}

// Handler for Axios errors
page.onAxiosError = error => {
  console.error(error)

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
    : 'There was an error with the request.\nPlease check the console for more information.'

  return swal(`${error.response.status} ${statusText}`, description, 'error')
}

page.do = (dest, trigger) => {
  const user = page.user.value.trim()
  if (!user) return swal('An error occurred!', 'You need to specify a username.', 'error')

  const pass = page.pass.value.trim()
  if (!pass) return swal('An error occurred!', 'You need to specify a password.', 'error')

  trigger.classList.add('is-loading')
  axios.post(`api/${dest}`, {
    username: user,
    password: pass
  }).then(response => {
    if (response.data.success === false) {
      trigger.classList.remove('is-loading')
      return swal(`Unable to ${dest}!`, response.data.description, 'error')
    }

    localStorage.token = response.data.token
    window.location = 'dashboard'
  }).catch(error => {
    trigger.classList.remove('is-loading')
    page.onAxiosError(error)
  })
}

page.verify = () => {
  axios.post('api/tokens/verify', {
    token: page.token
  }).then(response => {
    if (response.data.success === false) {
      page.unhide()
      return swal('An error occurred!', response.data.description, 'error')
    }

    // Redirect to dashboard if token is valid
    window.location = 'dashboard'
  }).catch(error => {
    page.unhide()
    page.onAxiosError(error)
  })
}

window.addEventListener('DOMContentLoaded', () => {
  page.user = document.querySelector('#user')
  page.pass = document.querySelector('#pass')

  // Prevent default form's submit action
  const form = document.querySelector('#authForm')
  form.addEventListener('submit', event => {
    event.preventDefault()
  })

  const loginBtn = document.querySelector('#loginBtn')
  if (loginBtn) {
    loginBtn.addEventListener('click', event => {
      if (!form.checkValidity()) return
      page.do('login', event.currentTarget)
    })
  }

  const registerBtn = document.querySelector('#registerBtn')
  if (registerBtn) {
    registerBtn.addEventListener('click', event => {
      if (!form.checkValidity()) {
        // Workaround for browsers to display native form error messages
        return loginBtn.click()
      }
      page.do('register', event.currentTarget)
    })
  }

  if (page.token) page.verify()
  else page.unhide()
})
