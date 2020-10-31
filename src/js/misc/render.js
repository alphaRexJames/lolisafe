/* global page, swal */

const render = {
  lsKey: 'render',
  type: 'miku', // This is intended to be hard-coded
  configs: {
    al: {
      name: 'ship waifu~',
      root: 'render/al/',
      array: [
        'admiral_graf_spee_1.png',
        'admiral_hipper_1.png',
        'akagi_1.png',
        'akashi_1.png',
        'akashi_2.png',
        'atago_1.png',
        'atago_3.png',
        'atago_4.png',
        'atago_5.png',
        'belfast_2.png',
        'choukai_1.png',
        'deutschland_1.png',
        'enterprise_1.png',
        'glorious_1.png',
        'hammann_1.png',
        'hammann_2.png',
        'hammann_3.png',
        'hatsuharu_1.png',
        'kaga_1.png',
        'kaga_2.png',
        'kaga_3.png',
        'laffey_1.png',
        'laffey_2.png',
        'laffey_3.png',
        'prinz_eugen_3.png',
        'san_diego_1.png',
        'takao_3.png',
        'unicorn_1.png',
        'unicorn_2.png',
        'unicorn_3.png',
        'unicorn_4.png',
        'unicorn_6.png',
        'unicorn_7.png',
        'unicorn_8.png',
        'yamashiro_1.png',
        'yamashiro_2.png',
        'yamashiro_3.png',
        'yukikaze_1.png'
      ]
    },
    miku: {
      name: 'miku ❤️~',
      root: 'render/miku/',
      array: []
    }
  },
  config: null,
  selected: null,
  done: false
}

// miku: Generate an array of file names from 001.png to 050.png
for (let i = 1; i <= 50; i++) render.configs.miku.array.push(`${('00' + i).slice(-3)}.png`)

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

render.parseVersion = () => {
  const renderScript = document.querySelector('#renderScript')
  if (renderScript && renderScript.dataset.version) return `?v=${renderScript.dataset.version}`
  else return ''
}

render.do = reload => {
  if (!render.done) render.done = true

  render.config = render.configs[render.type]
  if (!render.config || !render.config.array.length) return

  const previousElement = document.querySelector('body > .render')
  if (previousElement) previousElement.remove()

  const doRender = () => {
    if (render.version === undefined) {
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
