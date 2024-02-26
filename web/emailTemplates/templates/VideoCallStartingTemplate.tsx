import * as React from "react";
import FypBaseTemplate from "../components/FypBaseTemplate.js";

interface VideoCallStartingTemplateProps {
	fanName: string;
	creatorName: string;
	joinLink: string;
}

export function VideoCallStartingTemplate(
	props: VideoCallStartingTemplateProps,
) {
	return (
		<FypBaseTemplate>
			<h1>Your Video Call is Starting Now!</h1>

			<div>Hello {props.fanName},</div>
			<div style={{ marginTop: "20px" }}>
				Your scheduled video call with {props.creatorName} is starting
				now! Click here to join your call:{" "}
				<a href={props.joinLink}>Join Call</a>. Have a great
				conversation!
			</div>
			<div style={{ marginTop: "30px" }}>
				Regards,
				<br />
				The FYP.Fans Team
			</div>
		</FypBaseTemplate>
	);
}
