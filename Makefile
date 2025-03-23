sync-types:
	./scripts/sync_types.sh

sync-s3:
	./scripts/s3_sync.sh

moderate:
	node ./scripts/moderate_polls.js && \
	open -a "LibreOffice" data/moderate_polls.csv
