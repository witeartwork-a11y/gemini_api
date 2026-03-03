// Cloud job merge utilities

export const getJobVersion = (job) => {
    const raw = job?.updatedAt ?? job?.timestamp ?? 0;
    const version = Number(raw);
    return Number.isFinite(version) ? version : 0;
};

export const normalizeJobStatus = (status) => {
    const text = String(status || '').toUpperCase();
    return text.startsWith('JOB_STATE_') ? text.replace('JOB_STATE_', '') : text;
};

export const getJobStatusRank = (status) => {
    const normalized = normalizeJobStatus(status);
    const rankMap = {
        STATE_UNSPECIFIED: 0,
        UNSPECIFIED: 0,
        PENDING: 1,
        RUNNING: 2,
        SUCCEEDED: 4,
        FAILED: 4,
        CANCELLED: 4,
    };
    return rankMap[normalized] ?? 0;
};

export const mergeCloudJobs = (existingJobs, incomingJobs) => {
    const merged = new Map();

    for (const job of existingJobs) {
        if (!job?.id) continue;
        merged.set(job.id, job);
    }

    for (const incoming of incomingJobs) {
        if (!incoming?.id) continue;

        const existing = merged.get(incoming.id);
        if (!existing) {
            merged.set(incoming.id, incoming);
            continue;
        }

        const existingVersion = getJobVersion(existing);
        const incomingVersion = getJobVersion(incoming);

        if (incomingVersion > existingVersion) {
            merged.set(incoming.id, { ...existing, ...incoming });
            continue;
        }

        if (incomingVersion < existingVersion) {
            continue;
        }

        const mergedJob = { ...existing, ...incoming };
        if (getJobStatusRank(existing.status) > getJobStatusRank(incoming.status)) {
            mergedJob.status = existing.status;
        }
        if (!mergedJob.outputFileUri) {
            mergedJob.outputFileUri = existing.outputFileUri || incoming.outputFileUri;
        }

        merged.set(incoming.id, mergedJob);
    }

    return Array.from(merged.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
};
