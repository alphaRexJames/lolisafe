/* global page, swal */

const render = {
  lsKey: 'render',
  configs: {
    al: {
      name: 'ship waifu~',
      root: 'render/al/',
      // 001.png ~ 038.png
      array: Array.apply(null, { length: 38 }).map((_, i) => `${('00' + (i + 1)).slice(-3)}.png`)
    },
    miku: {
      name: 'miku ❤️~',
      root: 'render/miku/',
      // 001.png ~ 050.png
      array: Array.apply(null, { length: 50 }).map((_, i) => `${('00' + (i + 1)).slice(-3)}.png`)
    }
  },
  config: null,
  selected: null,
  done: false
}

render.showTogglePrompt = () => {
  const renderEnabled = !(localStorage[render.lsKey] === '0')
  const div = document.createElement('div')
  div.innerHTML = `
    <div class="field">
      <div class="control">
        <label class="checkbox">
          <input id="swalRender" type="checkbox" ${renderEnabled ? 'checked' : ''}>
          Enable random render of ${render.config.name}
        </label>
      </div>
      <p class="help">If disabled, you will still be able to see a small button on the bottom right corner of the screen to re-enable it.</p>
    </div>
  `

  const buttons = {}
  if (renderEnabled) {
    buttons.reload = {
      text: 'Nah fam, show me a different render',
      className: 'swal-button--cancel'
    }
  }
  buttons.confirm = true

  swal({
    content: div,
    buttons
  }).then(value => {
    if (value === 'reload') {
      render.do(true)
    } else if (value) {
      const newValue = div.querySelector('#swalRender').checked ? undefined : '0'
      if (newValue !== localStorage[render.lsKey]) {
        if (newValue) localStorage[render.lsKey] = newValue
        else localStorage.removeItem(render.lsKey)
        swal('', `Random render is now ${newValue ? 'disabled' : 'enabled'}.`, 'success', {
          buttons: false,
          timer: 1500
        })
        render.do()
      }
    }
  })
}

render.parseSelectedConfig = () => {
  const renderScript = document.querySelector('#renderScript')
  if (renderScript && renderScript.dataset.config) return renderScript.dataset.config
}

render.parseVersion = () => {
  const renderScript = document.querySelector('#renderScript')
  if (renderScript && renderScript.dataset.version) return `?v=${renderScript.dataset.version}`
  else return ''
}

render.do = reload => {
  if (!render.done) render.done = true

  render.config = render.configs[render.parseSelectedConfig()]
  if (!render.config || !render.config.array.length) return

  const previousElement = document.querySelector('body > .render')
  if (previousElement) previousElement.remove()

  const doRender = () => {
    if (typeof render.version === 'undefined') {
      render.version = render.parseVersion()
    }

    // Let us just allow people to get new render when toggling the option
    render.selected = render.config.array[Math.floor(Math.random() * render.config.array.length)]
    element = document.createElement('img')
    element.alt = element.title = render.config.name
    element.className = 'is-hidden-mobile'
    element.src = `${render.config.root}${render.selected}${render.version}`
  }

  let element
  if (!reload && localStorage[render.lsKey] === '0') {
    element = document.createElement('a')
    element.className = 'button is-info is-hidden-mobile'
    element.title = render.config.name
    element.innerHTML = '<i class="icon-picture"></i>'
  } else {
    doRender()
  }

  element.classList.add('render')
  element.addEventListener('click', render.showTogglePrompt)
  document.body.appendChild(element)
}

render.onloaded = () => {
  // If the main script had already done its API check, yet render haven't been triggered, do it
  // This would only happen if this render script only gets loaded after the main script's API check
  if (typeof page !== 'undefined' && page.apiChecked && !render.done) {
    render.do()
  }
}

if (document.readyState === 'interactive' || document.readyState === 'complete') {
  render.onloaded()
} else {
  window.addEventListener('DOMContentLoaded', () => render.onloaded())
}
