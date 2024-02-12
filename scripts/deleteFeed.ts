import dotenv from 'dotenv'
import { AtpAgent } from '@atproto/api'

(async () => {
	dotenv.config()

	const handle = 'yukimis.blue'
	if (!process.env.FEEDGEN_PUBLISH_APP_PASSWORD) {
		throw new Error('Please provide an app password in the .env file')
	}
	const password = process.env.FEEDGEN_PUBLISH_APP_PASSWORD

	try {
		const agent = new AtpAgent({ service: 'https://bsky.social' })

		await agent.login({ identifier: handle, password })
		const result = await agent.api.com.atproto.repo.deleteRecord({
			repo: agent.session?.did ?? '',
			collection: 'app.bsky.feed.generator',
			rkey: 'star-rail',
		})

		if (result.success) {
			console.log('All done 🎉')
			return true
		}
	} catch (e) {
		console.log(e)
	}
	console.log('delete feed failed')
	return false
})()