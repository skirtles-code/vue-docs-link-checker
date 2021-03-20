// This is the starting point. Only URLs starting with this prefix will be fetched.
const baseUrl = 'https://v3.vuejs.org/'

// Wait for pages to load. Can be shorter locally.
const delay = 2500

const ignoreHashes = [
  'support-vuejs/#btc',
  'support-vuejs/#bch',
  'support-vuejs/#eth',
  'support-vuejs/#ltc'
].map(url => baseUrl + url)

;(async() => {
  const puppeteer = require('puppeteer')

  const browser = await puppeteer.launch()
  const page = await browser.newPage()

  const urls = [baseUrl]
  const pageSource = Object.create(null)
  const pageHashes = Object.create(null)
  const linkedHashes = Object.create(null)
  pageSource[baseUrl] = 'baseUrl'
  linkedHashes[baseUrl] = new Set()

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
        logError(`* Missing page ${url}`)
        log(`  - Linked from ${pageSource[url]}`)
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

    // Check the sidebar contains the current page
    const hasSidebar = await page.evaluate(() => {
      return !document.querySelector('.no-sidebar')
    })

    if (hasSidebar) {
      const includedInIndex = await page.evaluate(() => {
        return !!document.querySelector('.active.sidebar-link,.active.sidebar-heading')
      })

      if (!includedInIndex) {
        // Check whether the page is linked from the main header instead
        const navbarLinks = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('.navbar a')).map(anchor => anchor.href)
        })

        // URL after redirects
        const finalUrl = page.url()

        if (!navbarLinks.map(stripUrlSuffix).includes(stripUrlSuffix(finalUrl))) {
          logError(`* Missing from index: ${url}`)
        }
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
      if (link.startsWith(baseUrl)) {
        const trimmed = link.replace(/#.*$/, '')

        if (!pageSource[trimmed]) {
          pageSource[trimmed] = url
          linkedHashes[trimmed] = Object.create(null)
          urls.push(trimmed)
        }

        if (link !== trimmed) {
          const hash = decodeURIComponent(link.replace(/^.*#/, ''))

          // Skip href="#" links
          if (hash) {
            linkedHashes[trimmed][hash] = linkedHashes[trimmed][hash] || new Set()
            linkedHashes[trimmed][hash].add(url)
          }
        }
      }
    }
  }

  log('=== Checking hashes ===')

  const skippedHashes = new Set()

  for (const url of urls) {
    const hashes = pageHashes[url]
    const required = linkedHashes[url]

    for (const hash in required) {
      if (!hashes.has(hash)) {
        const fullUrl = `${url}#${hash}`

        if (ignoreHashes.includes(fullUrl)) {
          skippedHashes.add(fullUrl)
        } else {
          logError(`* Missing hash ${url}#${hash}`)

          for (const source of required[hash]) {
            log(`  - Linked from ${source}`)
          }
        }
      }
    }
  }

  if (skippedHashes.size) {
    log(`Skipped hashes:`)

    for (const hash of skippedHashes) {
      log(`- ${hash}`)
    }
  }

  for (const hash of ignoreHashes) {
    if (!skippedHashes.has(hash)) {
      logError(`* Hash ${hash} was configured to be ignored but was not encountered`)
    }
  }

  await browser.close()

  function stripUrlSuffix (url) {
    return url.replace(/#.*$/, '').replace(/\.html$/, '').replace(/\/$/, '')
  }

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
