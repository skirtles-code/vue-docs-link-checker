// This is the starting point. Only URLs starting with this prefix will be fetched.
const baseURL = 'https://v3.vuejs.org/'

// Wait for pages to load. Can be shorter locally.
const delay = 2500

;(async() => {
  const puppeteer = require('puppeteer')

  const browser = await puppeteer.launch()
  const page = await browser.newPage()

  const urls = [baseURL]
  const pageSource = Object.create(null)
  const pageHashes = Object.create(null)
  const linkedHashes = Object.create(null)
  pageSource[baseURL] = 'baseURL'
  linkedHashes[baseURL] = new Set()

  for (let index = 0; index < urls.length; ++index) {
    const url = urls[index]

    log(`Checking page ${index + 1}/${urls.length}: ${url}`)

    await page.goto('about:blank')

    // It'd be nice to use `await` here but it fails for some pages, so use a timer instead
    page.goto(url)

    await pause(delay)

    // Use the <h1> to decide whether it's the 404 page
    const pageH1s = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('h1')).map(h1 => h1.innerText)
    })

    if (pageH1s.length === 0) {
      logError(`* Missing h1: ${url}`)
    } else {
      if (pageH1s.length > 1) {
        logError(`* Multiple h1s: ${url}`)
      }

      if (pageH1s[0].trim() === '404') {
        logError(`* Missing: ${url}, found in ${pageSource[url]}`)
      }
    }

    // Check the headings
    const pageHxs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map(hx => +hx.tagName.charAt(1))
    })

    if (pageHxs.length) {
      let current = pageHxs[0]

      for (const nextHeading of pageHxs) {
        if (nextHeading > current + 1) {
          logError(`* Heading jumps from h${current} to h${nextHeading} in ${url}`)
        }

        current = nextHeading
      }
    }

    // These are the hashes available in the page that links can use
    const hashes = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('[id]')).map(el => el.id)
    })

    pageHashes[url] = new Set(hashes)

    // Trawl for <a> tags to find more links
    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a')).map(anchor => anchor.href)
    })

    for (const link of links) {
      if (link.startsWith(baseURL)) {
        const trimmed = link.replace(/#.*$/, '')

        if (!pageSource[trimmed]) {
          pageSource[trimmed] = url
          linkedHashes[trimmed] = new Set()
          urls.push(trimmed)
        }

        if (link !== trimmed) {
          const hash = link.replace(/^.*#/, '')

          // Skip href="#" links
          if (hash) {
            linkedHashes[trimmed].add(hash)
          }
        }
      }
    }
  }

  log('=== Checking hashes ===')

  for (const url of urls) {
    const hashes = pageHashes[url]
    const required = linkedHashes[url]

    for (const hash of required) {
      if (!hashes.has(hash)) {
        logError(`* Missing ${url} : ${hash}`)
      }
    }
  }

  await browser.close()

  async function pause (time) {
    return new Promise(resolve => {
      setTimeout(resolve, time)
    })
  }

  function log (msg) {
    console.log(msg)
  }

  function logError (msg) {
    console.log('\x1b[36m%s\x1b[0m', msg)
  }
})()
