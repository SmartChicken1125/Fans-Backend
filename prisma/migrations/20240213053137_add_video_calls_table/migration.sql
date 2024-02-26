-- CreateTable
CREATE TABLE "video_calls" (
    "id" BIGINT NOT NULL,
    "messageChannelId" BIGINT NOT NULL,
    "chimeMeetingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_call_participants" (
    "userId" BIGINT NOT NULL,
    "videoCallId" BIGINT NOT NULL,
    "attendeeId" TEXT,

    CONSTRAINT "video_call_participants_pkey" PRIMARY KEY ("videoCallId","userId")
);

-- AddForeignKey
ALTER TABLE "video_calls" ADD CONSTRAINT "video_calls_messageChannelId_fkey" FOREIGN KEY ("messageChannelId") REFERENCES "message_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_call_participants" ADD CONSTRAINT "video_call_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_call_participants" ADD CONSTRAINT "video_call_participants_videoCallId_fkey" FOREIGN KEY ("videoCallId") REFERENCES "video_calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
