/* global page, axios */

const newsfeed = {
  lsKey: 'newsfeed',
  feedUrl: 'https://blog.fiery.me/rss-newsfeed.xml',
  maxItems: 3,
  dismissed: {},
  done: false
}

newsfeed.simpleParseDate = string => {
  // For now limited to support the following examples (used in blog.fiery.me):
  // Mon, 27 Jul 2020 18:30:00 GMT
  // Sat, 16 May 2020 14:55:00 GMT
  // Probably better to use a library if it needs to support other formats.
  const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 }
  const match = string.match(/[a-zA-Z]*,\s(\d{2})\s([a-zA-Z]{3})\s(\d{4})\s(\d{2}):(\d{2}):(\d{2})\sGMT/)
  if (match && (months[match[2]] !== undefined)) {
    const date = new Date()
    date.setUTCDate(match[1])
    date.setUTCMonth(months[match[2]])
    date.setUTCFullYear(match[3])
    date.setUTCHours(match[4])
    date.setUTCMinutes(match[5])
    date.setUTCSeconds(match[6])
    return date
  }
}

newsfeed.formatRelativeDate = delta => {
  // https://stackoverflow.com/a/7641812
  const minute = 60
  const hour = minute * 60
  const day = hour * 24
  const week = day * 7

  let fuzzy
  let unit
  if (delta < minute) {
    fuzzy = delta
    unit = 'second'
  } else if (delta < hour) {
    fuzzy = Math.floor(delta / minute)
    unit = 'minute'
  } else if (delta < day) {
    fuzzy = Math.floor(delta / hour)
    unit = 'hour'
  } else if (delta < week) {
    fuzzy = Math.floor(delta / day)
    unit = 'day'
  } else {
    fuzzy = Math.floor(delta / week)
    unit = 'week'
  }

  return `${fuzzy} ${unit}${fuzzy !== 1 ? 's' : ''} ago`
}

newsfeed.formatNotification = item => {
  const parsedDate = newsfeed.simpleParseDate(item.pubDate)
  const dateDelta = Math.round((+new Date() - parsedDate) / 1000)
  const isRecentWeek = dateDelta <= 604800

  const element = document.createElement('a')
  element.dataset.identifier = item.identifier
  element.className = 'notification is-info'
  element.href = item.link
  element.target = '_blank'
  element.innerHTML = `
    <button class="delete" title="Dismiss"></button>
    <div class="content">
      <div class="news-title">
        ${item.title || 'Untitled'}
      </div>
      <div class="news-excerpt">
        ${item.description
          ? `${item.description.slice(-1) === '…' ? `${item.description.slice(0, -1)} […]` : item.description}`
          : 'N/A'}
      </div>
      <div class="news-date${isRecentWeek ? ' is-recent-week' : ''}">
        <span title="${parsedDate.toLocaleString()}">${newsfeed.formatRelativeDate(dateDelta)}</span>
      </div>
    <div>
  `
  return element
}

newsfeed.dismissNotification = element => {
  if (!element || !element.dataset.identifier) return

  newsfeed.dismissed[element.dataset.identifier] = 1
  element.parentNode.removeChild(element)

  const keys = Object.keys(newsfeed.dismissed)
  if (keys.length > newsfeed.maxItems) {
    for (let i = 0; i < keys.length - newsfeed.maxItems; i++) {
      delete newsfeed.dismissed[keys[i]]
    }
  }

  localStorage[newsfeed.lsKey] = JSON.stringify(newsfeed.dismissed)
}

newsfeed.do = () => {
  return axios.get(newsfeed.feedUrl, {
    responseType: 'document'
  }).then(response => {
    if (response && response.data && response.data.documentElement instanceof Element) {
      const items = response.data.documentElement.querySelectorAll('item')

      if (items.length) {
        const dismissed = localStorage[newsfeed.lsKey]
        if (dismissed) {
          newsfeed.dismissed = JSON.parse(dismissed)
        }

        const element = document.createElement('section')
        element.id = 'newsfeed'
        element.className = 'section'
        element.innerHTML = `
          <div class="columns is-gapless">
            <div class="column is-hidden-mobile"></div>
            <div class="column is-hidden-mobile"></div>
            <div class="column has-text-right"></div>
          </div>
        `
        const column = element.querySelector('.columns > .column:last-child')

        for (let i = 0; i < Math.min(newsfeed.maxItems, items.length); i++) {
          const titleElement = items[i].querySelector('title')
          const descriptionElement = items[i].querySelector('description')
          const pubDateElement = items[i].querySelector('pubDate')
          const linkElement = items[i].querySelector('link')

          const title = titleElement ? titleElement.textContent : ''
          const description = descriptionElement ? descriptionElement.textContent : ''
          const pubDate = pubDateElement ? pubDateElement.textContent : ''
          const link = linkElement ? linkElement.textContent : ''

          const identifier = title + '|' + description + '|' + pubDate + '|' + link

          if (!newsfeed.dismissed[identifier]) {
            const notificationElement = newsfeed.formatNotification({
              title, description, pubDate, link, identifier
            })

            const dismissTrigger = notificationElement.querySelector('.delete')
            if (dismissTrigger) {
              dismissTrigger.addEventListener('click', function () {
                event.preventDefault()
                newsfeed.dismissNotification(event.target.parentNode)
              })
            }

            column.appendChild(notificationElement)
          }
        }

        document.body.appendChild(element)
      }
    } else {
      throw Error('response.data.documentElement is NOT an instance of Element')
    }
  }).catch(console.error)
}

newsfeed.onloaded = () => {
  // If the main script had already done its API check, yet newsfeed haven't been triggered, do it
  // This would only happen if this newsfeed script only gets loaded after the main script's API check
  if (typeof page !== 'undefined' && page.apiChecked && !newsfeed.done) {
    newsfeed.do()
  }
}

if (document.readyState === 'interactive' || document.readyState === 'complete') {
  newsfeed.onloaded()
} else {
  window.addEventListener('DOMContentLoaded', () => newsfeed.onloaded())
}
