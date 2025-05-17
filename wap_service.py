from flask import Flask, request
import run_replay

app = Flask(__name__)

@app.route('/replay', methods=['GET'])
async def run_replay_endpoint():
    try:
        # Get parameters from query string
        iterations = int(request.args.get('concurrent')) 
        model = request.args.get('model') 
        file_path = request.args.get('file_path') 

        # Validate required parameters
        if not model or not file_path:
            return {"status": "error", "message": "Model and file_path are required"}, 400

        await run_replay.main(iterations, model, file_path)
        return {"status": "success", "message": "Replay executed successfully"}
    except ValueError as ve:
        return {"status": "error", "message": "Invalid iterations value: must be an integer"}, 400
    except Exception as e:
        return {"status": "error", "message": str(e)}, 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3089)