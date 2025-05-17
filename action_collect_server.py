import os
import datetime
import argparse
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

def mkdir_n_define_file_name(data_root_dir, task_name):
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    date_folder = timestamp.split('_')[0]
    # Include task_name after the date folder
    folderpath = os.path.join(data_root_dir, date_folder, task_name)
    if not os.path.exists(folderpath):
        os.makedirs(folderpath)
    filename = f"summary_event_{timestamp}.json"
    filepath = os.path.join(folderpath, filename)
    return filepath

@app.route('/action-data', methods=['POST'])
def handle_event():
    if not request.is_json:
        return jsonify({"status": "error", "message": "Request must be JSON"}), 400

    event_data = request.get_json()
    task_id = event_data["taskId"]
    filepath = mkdir_n_define_file_name("data", task_id)

    with open(filepath, "w", encoding='utf-8') as json_file:
        import json
        json.dump(event_data, json_file, indent=2)

    return jsonify({"status": "success", "message": f"Event received and saved as {filepath}"}), 200

if __name__ == '__main__':
    # Run the Flask app
    app.run(debug=True, host='0.0.0.0', port=4934)