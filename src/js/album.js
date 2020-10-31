/* global LazyLoad */

// eslint-disable-next-line no-unused-vars
const lsKeys = {}

const page = {
  lazyLoad: null
}

window.addEventListener('DOMContentLoaded', () => {
  const elements = document.querySelectorAll('.file-size')
  for (let i = 0; i < elements.length; i++) {
    elements[i].innerHTML = page.getPrettyBytes(parseInt(elements[i].innerHTML.replace(/\s*B$/i, '')))
  }

  page.lazyLoad = new LazyLoad()
})
