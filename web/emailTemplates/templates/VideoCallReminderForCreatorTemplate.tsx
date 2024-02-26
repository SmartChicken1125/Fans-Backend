import * as React from "react";
import FypBaseTemplate from "../components/FypBaseTemplate.js";

interface VideoCallReminderForCreatorTemplateProps {
	creatorName: string;
	fanName: string;
}

export function VideoCallReminderForCreatorTemplate(
	props: VideoCallReminderForCreatorTemplateProps,
) {
	return (
		<FypBaseTemplate>
			<h1>Reminder: Video Call with {props.fanName} in One Hour</h1>

			<div>Dear {props.creatorName},</div>
			<div style={{ marginTop: "20px" }}>
				This is a reminder that your video call with {props.fanName} is
				starting in one hour. Make sure you're ready to provide an
				amazing experience!
			</div>
			<div style={{ marginTop: "30px" }}>
				Cheers,
				<br />
				The FYP.Fans Team
			</div>
		</FypBaseTemplate>
	);
}
