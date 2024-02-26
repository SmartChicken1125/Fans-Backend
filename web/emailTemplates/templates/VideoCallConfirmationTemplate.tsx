import * as React from "react";
import FypBaseTemplate from "../components/FypBaseTemplate.js";

interface VideoCallConfirmationTemplateProps {
	fanName: string;
	creatorName: string;
	date: string;
	time: string;
	duration: string;
	amount: string;
}

export function VideoCallConfirmationTemplate(
	props: VideoCallConfirmationTemplateProps,
) {
	return (
		<FypBaseTemplate>
			<h1>Video Call Confirmation with {props.creatorName}</h1>

			<div>Dear {props.fanName},</div>
			<div style={{ marginTop: "20px" }}>
				Your video call with {props.creatorName} is scheduled for{" "}
				{props.date} at {props.time} for {props.duration}. The cost of
				the call is {props.amount}. Please visit our website at the
				scheduled time, and you will see a "Join" button to start your
				call.
			</div>
			<div style={{ marginTop: "30px" }}>
				Best,
				<br />
				The FYP.Fans Team
			</div>
		</FypBaseTemplate>
	);
}
