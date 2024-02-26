import * as React from "react";
import FypBaseTemplate from "../components/FypBaseTemplate.js";

interface VideoCallReminderTemplateProps {
	fanName: string;
	creatorName: string;
	cancelLink: string;
}

export function VideoCallReminderTemplate(
	props: VideoCallReminderTemplateProps,
) {
	return (
		<FypBaseTemplate>
			<h1>
				Your Video Call with {props.creatorName} Starts in One Hour!
			</h1>

			<div>Hi {props.fanName},</div>
			<div style={{ marginTop: "20px" }}>
				Just a reminder that your video call with {props.creatorName} is
				scheduled to start in one hour. If you need to cancel, please
				click here: <a href={props.cancelLink}>Cancel my call</a>.
			</div>
			<div style={{ marginTop: "30px" }}>
				Cheers,
				<br />
				The FYP.Fans Team
			</div>
		</FypBaseTemplate>
	);
}
